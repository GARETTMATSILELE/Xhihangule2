# Phase 8 — Zimbabwe tax, trust and financial compliance

This document describes how the application treats VAT, Capital Gains Tax, Capital Gains Withholding Tax, trust/client money, ZIMRA returns, and fiscalisation after Phase 8 hardening.

The application is **not** a ZIMRA-certified system and **does not** file returns or fiscalise invoices with ZIMRA unless a live FDMS integration is later implemented and confirmed.

## Canonical accounting path

All payment accounting still posts through the Phase 7 orchestrator:

`paymentAccountingOrchestrator.postPaymentAccounting`
→ property account income
→ agent commission sync
→ company commission projection (`agencyShare`)
→ journal + VAT record (`accountingIntegrationService.syncPaymentReceived`)

Frontend forms must not be the source of truth for VAT, commission, CGT, CGWT, owner amounts, or seller amounts.

## VAT calculation — AUTOMATED

VAT is charged only when **all** of the following are true:

1. Company `taxProfile.vatRegistered` is true
2. The company was VAT registered on the **transaction date** (effective and cancellation dates)
3. The supply treatment is `STANDARD_TAXABLE`
4. VAT was requested for that service (for example VAT on commission)

A property “VAT on commission” flag alone is not sufficient.

Rates come from the **effective-dated** `TaxRate` table (`taxType: VAT`). New companies with no rates are seeded with 15% until 31 December 2025 and **15.5% from 1 January 2026**. Existing rate tables are not rewritten. Historical payments keep `vatRateApplied` / snapshot fields.

Inclusive VAT:

`VAT = gross − gross / (1 + rate)`  
`net = gross / (1 + rate)`

Exclusive VAT on commission:

`VAT = commission × rate`

Introduction commission uses `COMMISSION_VAT_INCLUSIVE` when VAT applies.

## VAT-inclusive calculation — AUTOMATED

Implemented in `server/src/services/tax/vatCalculation.ts` and used by commission and sale VAT extraction.

## Agency commission VAT — AUTOMATED

Server policy: `resolveCommissionVatPolicy`. Snapshot on each completed payment:

- commissionRate, commissionBase, commissionAmount / commissionNet
- commissionVatTreatment
- vatRate, vatAmount (`commissionDetails.vatOnCommission`)

GL (agent collections, new payments only):

- Dr **1003 Client Trust Bank** (full receipt)
- Cr **4001 / 4002** (commission net only — company revenue)
- Cr **2101 VAT Payable** (VAT on commission / sale VAT)
- Cr **2103 Owner Payable** or **2104 Seller Payable** (residual client money)

Landlord rent is not company revenue.

## Property VAT classification — MANUAL + AUTOMATED GATE

Stored on the property:

- `propertyUseClass`
- `vatSupplyTreatment`
- `saleVatTreatment`

Treatments: `EXEMPT`, `STANDARD_TAXABLE`, `ZERO_RATED`, `OUT_OF_SCOPE`, `ACCOUNTANT_REVIEW`.

Residential dwelling rental defaults to `EXEMPT`. Commercial rental and property sales default to `ACCOUNTANT_REVIEW` until classified. Uncertain supplies do not auto-charge VAT.

## Company VAT registration — MANUAL

Settings → Company:

- VAT registered
- VAT registration effective date
- VAT registration cancellation date
- VAT category
- TIN (`tinNumber`)
- VAT number

Until VAT registered is set with an effective date, **VAT = 0** on new calculations.

## Trust accounting — AUTOMATED (sales) / GL-LEVEL (rentals)

Sales trust accounts remain the detailed client ledger for sale proceeds, deposits, withholding, and seller transfers.

Rental collections post to GL **1003** (trust bank) and **2103** (owner payable). Dashboard compares:

`Trust Bank 1003` ≟ `2103 + 2104 + 2105 + 2106`

A mismatch is shown; it is not silently repaired.

## Principal vs agent — AUTOMATED (new journals)

The agency recognises commission (and VAT on commission) as company amounts. Gross rent and gross sale proceeds are client/trust money. CompanyAccount projection remains `agencyShare` (Phase 7). GL 4001 is commission net; agent share is still posted to 5002 / 2102.

## Capital Gains Tax — AUTOMATED STRUCTURE, RATE MANUAL

CGT is **not** `20% × sale price`.

```
capital gain = sale proceeds − acquisition cost − improvements − qualifying expenses − selling costs + adjustments
CGT = max(0, capital gain) × configured CGT rate
```

Missing acquisition cost → CGT amount 0 and accountant review.  
No gain / loss → CGT 0.  
Rate not configured → CGT 0 and review.

Immutable settlement snapshot: salePrice, costs, capitalGain, cgtRate, cgtAmount, calculationBasis, calculatedAt.

## Capital Gains Withholding Tax — AUTOMATED WHEN RATE CONFIGURED

Separate tax type `CAPITAL_GAINS_WITHHOLDING_TAX`. Calculated from sale consideration × CGWT rate. Independent of final CGT.

Trust settlement waterfall withholds **CGWT**, not final CGT:

Gross sale → sale VAT → CGWT → agency commission → VAT on commission → other deductions → seller net.

Withholding GL: Dr Seller Payable / Cr **2105 ZIMRA Withholding**.  
Remittance: Dr 2105 / Cr **1003 Trust Bank**.

## ZIMRA return workflow — MANUAL RECORDING

VAT return working paper is prepared in-app (taxable/exempt supplies, output VAT, input VAT, VAT on commission, VAT on sales, withholding credits, net payable).

Statuses: OPEN / PREPARED / REVIEWED / SUBMITTED / PAID / RECONCILED.

The application **does not** submit the return to ZIMRA. The accountant records the ZIMRA reference after external filing.

A VAT return cannot be marked PAID unless matching tax obligations are paid via a ZIMRA payment record.

## ZIMRA payment workflow — MANUAL + AUTOMATED GL

Accountant records:

- amount, date, bank (1001 company or 1003 trust), ZIMRA reference, payment reference
- allocations to one or more tax obligations (must equal the payment; cannot exceed outstanding)

Then optionally attaches a receipt. **Receipt uploaded ≠ paid.**

## Fiscalisation — NOT IMPLEMENTED (FDMS)

Status values: `INVOICE`, `NOT_FISCALISED`, `FISCALISATION_ATTEMPT`, `FISCALISATION_SUCCESS`, `FISCALISATION_FAILURE`.

A local QR / TIN / device serial is **not** fiscalisation. Invoices print **TAX INVOICE — NOT FISCALISED** unless `fiscalisationStatus === FISCALISATION_SUCCESS`. There is no live FDMS posting in this codebase.

## Tax reconciliation — AUTOMATED DISPLAY

Tax → Dashboard and Tax → Obligations show calculated / withheld / payable / submitted / paid / outstanding by type and period.

## Tax reversals — AUTOMATED ON PAYMENT REVERSAL

Original TaxObligation is marked REVERSED. A linked reversal obligation is created. Original amounts are not deleted.

## Historical transaction policy

Phase 8 does **not**:

- recalculate historical CGT or VAT
- rewrite historical commission
- change old GL journals
- backfill missing tax records onto old payments
- alter owner / seller / trust balances

Use **Tax → Historical review** for a compliance migration report and the accountant review queue.

## Tax calculation modes

| Tax | Mode |
| --- | --- |
| VAT output (sale, when classified taxable) | AUTOMATED |
| VAT on agency commission | AUTOMATED |
| VAT input | MANUAL |
| VAT withholding | MANUAL |
| Capital Gains Tax | AUTOMATED (needs costs + rate) |
| Capital Gains Withholding Tax | AUTOMATED (needs CGWT rate) |
| Property commission tax | MANUAL (type reserved) |
| PAYE | EXTERNAL — not calculated |
| Corporate income tax | EXTERNAL — not calculated |

## Remaining accountant / legal confirmation

Zimbabwe CGT rates, CGWT rates, which property sales are VATable, and mixed-use rental treatment must be confirmed with the company’s tax practitioner. This software does not constitute tax advice.

---

# Phase 8.1 — Tax and trust compliance closure

Phase 8.1 hardens remaining Phase 8 risks without rewriting Phase 7, without migrating historical amounts, and without silently altering posted journals or balances.

## CGT rate safety — AUTOMATED BLOCK

If a CGT calculation is required and no applicable effective-dated rate exists, settlement is `REQUIRES_TAX_REVIEW` / blocked. CGT is not stored as a final zero liability merely because the rate table is empty.

CGT = 0 is final only when:

- capital gain ≤ 0, or
- the transaction is explicitly marked `CGT_NOT_APPLICABLE` with an accountant reason.

Missing acquisition cost produces `CGT_SETTLEMENT_REVIEW_REQUIRED`. A provisional estimate may be stored and labelled; it is not the final tax liability.

## CGWT applicability — AUTOMATED / REVIEW REQUIRED

Capital Gains Tax and Capital Gains Withholding Tax remain independent obligations and independent UI labels.

| State | Meaning |
| --- | --- |
| `APPLICABLE` | Withhold using the effective-dated CGWT rate |
| `NOT_APPLICABLE` | Zero withholding, accountant reason required |
| `CGWT_RATE_MISSING` | Applicable (or undecided) but no rate — settlement blocked |
| `REVIEW_REQUIRED` | Applicability not decided |

Rate missing is not treated as not applicable.

## VAT return reconciliation — AUTOMATED GATE

The working paper stores taxable / exempt / zero-rated supplies, output VAT, input VAT, VAT on commission, VAT on taxable property sales, adjustments, withholding credits, and net VAT payable from tax obligations (not a raw `VatRecord.vatAmount` total).

Reconciliation:

```
tax obligation output VAT
− GL 2101 credits in the filing period
= difference
```

`RECONCILED` is blocked while a material unexplained difference exists. A documented timing-difference note is required to proceed.

## Tax payment allocation — AUTOMATED

ZIMRA bank amount = allocated obligations + explicit unallocated amount. Overpayments cannot be silently dropped. Unallocated posts to GL 1102 (tax prepayment) with a reason. Receipt upload still does not mark tax paid.

## Trust reconciliation scope — PARTIAL

Compared ledgers:

`1003` ≟ `2103 + 2104 + 2105 + 2106 + 2107`

Included: owner payable, seller payable, ZIMRA withholding, tenant deposits, levy payable.

Excluded (not faked as full): per-owner rental subledgers beyond GL 2103, maintenance funds without a dedicated GL, off-book lawyer/escrow custody.

## Levy / residual — AUTOMATED (new receipts only)

Canonical `PaymentAllocation` is the single server-side split:

gross → rent, levy, commission net, VAT on commission, owner payable, levy payable, company revenue, trust liability.

New rental journals credit levy to **2107 Levy Payable** and owner residual to **2103**. Historical journals are not rewritten. Owner statements prefer `paymentAllocation.ownerPayable` when present.

## CompanyAccount vs GL 4001 — INTENTIONAL / DETECTION ONLY

| Record | Amount |
| --- | --- |
| GL 4001 | commission net (company commission revenue) |
| GL 5002 / 2102 | agent share |
| CompanyAccount.agencyShare | retained agency share after PREA and agent split |

They are not the same economic line. Historical CompanyAccount values are not overwritten. Integrity checks compare commission net to GL 4001 without repair.

## FX limitation — REVIEW REQUIRED

Same-currency identity uses rate 1 with source `SAME_CURRENCY`. Cross-currency without a sourced rate is `FX_REVIEW_REQUIRED`. Rate 1 is not treated as a live FX quote. Live conversion is **NOT IMPLEMENTED**.

## Historical review workflow — MANUAL

Statuses: `OPEN`, `UNDER_REVIEW`, `ACKNOWLEDGED`, `CORRECTED_MANUALLY`, `NO_ACTION_REQUIRED` (legacy `open` / `resolved` / `ignored` still stored).

Historical CGT that equals 20% × sale price is flagged `LEGACY_CGT_CALCULATION`. No automatic replacement.

## Tax period lock — AUTOMATED

Once a VAT return is `SUBMITTED` / `PAID` / `RECONCILED`, ordinary edits to transactions in that period are blocked (409). Corrections must be reversals/adjustments in an open period.

## Permission model

| Role | Tax rates | Returns / ZIMRA payments | Overrides / settlement tax | Posted tax journals |
| --- | --- | --- | --- | --- |
| Accountant | configure | prepare, pay, allocate, review | yes, with reason | may post tax journals |
| Admin | configure company tax profile / rates | read; pay only if also accountant | company settings | no silent rewrite |
| Rental agent | no | no | no | no |
| Property owner | no | statements only | no | no |

## Remaining external / manual / not implemented

| Area | Mode |
| --- | --- |
| VAT working paper preparation | AUTOMATED |
| ZIMRA filing | EXTERNAL / MANUAL recording |
| FDMS fiscalisation | NOT IMPLEMENTED |
| PAYE | EXTERNAL |
| Corporate income tax | EXTERNAL |
| Live FX | NOT IMPLEMENTED |
| Full trust recon (all client-money categories) | PARTIAL |
| Historical repair | MANUAL / REVIEW REQUIRED |

## Phase 8.2 — Production verification

Live API must serve the current `dist` after restart. CORS allowlist includes development loopback and the CRA proxy origin (`http://localhost:5000`) without using `*`. Tax integrity POST is detection-only.

Trust recon status:

- difference = 0 → `BALANCED_WITHIN_SCOPE` (still PARTIAL; not FULL, not RECONCILED)
- difference ≠ 0 → `RECONCILIATION_EXCEPTION`

Levy on new receipts remains a **third-party payable** (GL 2107), not owner residual.

Historical CGT deductions remain labelled `LEGACY CGT DEDUCTION`. Workflow stage TAXES_PAID is labelled **Tax Deductions Recorded (not ZIMRA remittance)**.

This application is not ZIMRA certified, legally certified, tax certified, EAC certified, or IFRS certified.

## Phase 8.1 status

```
PASS WITH DOCUMENTED RISKS
```

Verified 16 September 2026. Historical payment, journal, owner, seller, trust, VAT, and tax snapshot amounts were not automatically rewritten. Remaining limitations are listed in this section (PARTIAL trust recon, EXTERNAL PAYE/corporate tax, NOT IMPLEMENTED live FX and FDMS, MANUAL historical repair).

## Phase 8.2 status

```
PASS WITH DOCUMENTED RISKS
```

Live API boot logs `phase: '8.2'`. Trust recon remains PARTIAL (`BALANCED_WITHIN_SCOPE` or `RECONCILIATION_EXCEPTION`). CORS allowlist includes development loopback and the CRA proxy origin. Restarting `node dist/index.js` with an ephemeral JWT secret invalidates existing accountant sessions; re-login is required.

---

# PHASE 8.3 FINAL TAX & TRUST SIGN-OFF REPORT

Verified 16 September 2026 against the live Phase 8.2 API and the current accountant session (Tinashe a/c, The Benjamins Realty). This phase did not rewrite historical financial amounts, did not redesign the Phase 7 orchestrator, did not add tax types, and did not implement FDMS, ZIMRA filing, PAYE, corporate income tax, or live FX.

This application is not ZIMRA certified, legally certified, tax certified, EAC certified, or IFRS certified.

### 1. Live server

```
PID:               18700 (node dist/index.js); npm wrapper 28472
Port:              5000
Build:             Phase 8.2  (boot marker phase: '8.2')
Build timestamp:   dist compiled 16 Sep 2026 11:35, then process started 11:36:27
Boot timestamp:    2026-09-16T09:37:19.833Z
Git HEAD:          8070b217  Vat on Commission and Reports  (2026-09-07)
```

The HTTP process was not restarted during Phase 8.3. A later `tsc` for tests updated files on disk; the running API continued serving the already-loaded Phase 8.2 modules. JWT remains ephemeral for this development process.

### 2. Authentication

```
Accountant login:  PASS (fresh session; Tinashe a/c)
Tax Compliance:    GET /api/accounting/tax-compliance  HTTP 200
                   categories, vatRateReview, trust.status, scope PARTIAL present
Tax Integrity:     POST /api/accounting/tax-integrity/run  HTTP 200
                   detectionOnly: true, repaired: false, 9 findings
```

### 3. CORS

```
Unauthenticated:   POST /api/accounting/tax-integrity/run → 401
Authenticated:     accountant POST → 200
Origin:            Access-Control-Allow-Origin: http://localhost:3000
                   Access-Control-Allow-Credentials: true
                   * is not used by Express
```

Relative `/api` calls through the CRA webpack proxy can show `Access-Control-Allow-Origin: *` from the proxy, not from Express. Direct requests to `http://localhost:5000` return the explicit origin.

Unauthenticated tax endpoints → 401. `POST /tax-integrity/run` requires `isAccountant` (403 for other authenticated roles).

### 4. Tax Compliance

Live company configuration (not invented):

```
VAT:          NOT ACTIVE (taxProfile.vatRegistered = false; VAT number empty)
              Dated VAT rate 15.5% exists from 2026-09-14 (does not cover 1 Jan 2026)
              Dashboard: VAT payable / paid / outstanding $0.00 — NO LIVE VAT OBLIGATIONS
CGT:          Rate unset. Outstanding $0.00 — No live Capital Gains Tax obligation
CGWT:         Rate unset. Withheld / remitted / outstanding $0.00
VAT Return:   No working paper. UI: NO LIVE VAT OBLIGATIONS — none invented
Tax Payments: Receipt upload does not mark PAID. Allocations + unallocatedAmount = bank amount
Tax Reviews:  6 open (detection only), including LEGACY CGT CALCULATION $38,000
              MISSING CGT RATE, MISSING CGWT RATE, VAT RATE REVIEW REQUIRED,
              VAT OBLIGATION VS GL 2101 (0 vs historical GL 41.85), COMPANY COMMISSION VS GL 4001
```

Dashboard controls: Attention required. Fiscalisation: 5 invoices not fiscalised. PAYE and corporate income tax are labelled as not calculated.

### 5. Trust

```
Status:      PARTIAL / BALANCED WITHIN SCOPE
             (not RECONCILED; not FULL TRUST ACCOUNT RECONCILIATION)
Included:    Owner rental funds (2103), Seller proceeds (2104), Tax withheld (2105),
             Tenant deposits (2106), Levies (2107)
Excluded:    Buyer deposits in sales subledgers; maintenance funds; unallocated receipts;
             other refundable balances; per-owner historical rental subledgers;
             external lawyer/escrow/developer custody
Difference:  $0.00  (1003 = 2103+2104+2105+2106+2107 within scope)
```

UI warning: “This is PARTIAL. BALANCED WITHIN SCOPE is not a full trust-account reconciliation.”

### 6. Rental + levy

Canonical `allocateRentalReceipt` (commission on rent, levy as third-party payable):

```
Rent $1,000 + Levy $50
Commission base $1,000 × 15% = $150
VAT 15.5% × $150 = $23.25
Owner payable = $826.75
Levy payable  = $50
Trust liability = $876.75
Company revenue = $150 (not $1,050)
```

PaymentAllocation = agent receipt journal (Dr 1003 $1,050; Cr 4001 $150; Cr 2101 $23.25; Cr 2103 $826.75; Cr 2107 $50). The same allocation is used by `accountingIntegrationService` and `propertyCommissionCalculator`.

### 7. Principal vs agent

```
company revenue     GL 4001 / 4002 commission net (agency fee)
client/trust money  GL 1003 debit; GL 2103 owner / 2104 seller residual; 2107 levy
```

Gross rent and gross sale proceeds are not company revenue because the agency collected them. Seller liability remains on 2104 until settlement/payment.

CompanyAccount.agencyShare vs GL 4001 remains intentionally different (retained share after PREA/agent split vs commission net). Detection only; historical CompanyAccount values are not rewritten.

### 8. Historical data

```
NO AUTOMATIC HISTORICAL DATA CHANGES
```

24 The Chimes, Greendale Harare: sale/price $190,000. Historical CGT deduction $38,000 (= 20% of sale price) remains flagged `LEGACY CGT CALCULATION` / labelled `LEGACY CGT DEDUCTION`. It was not recalculated, replaced with current CGT, or removed. Integrity `repaired: false`. Payments, journals, owner/seller/trust balances, and tax snapshots were not auto-repaired.

### 9. Tests

```
Phase 7:     PASS
Phase 8:     PASS
Phase 8.1:   PASS
Phase 8.2:   PASS
Phase 8.3:   PASS

Server TypeScript:  PASS (tsc / npm run build)
Client TypeScript:  PASS (npx tsc --noEmit)
Server Build:       PASS
Client Build:       PASS (react-scripts build)

Authenticated API:      PASS (GET tax-compliance 200)
Tax Integrity:          PASS (POST 200, detection-only)
Trust Reconciliation:   PASS (PARTIAL / BALANCED WITHIN SCOPE, difference 0)
```

### 10. Remaining limitations

APPLICATION LIMITATIONS

- Trust reconciliation is PARTIAL (GL 1003 vs 2103–2107 only)
- FDMS fiscalisation is not implemented; invoices stay NOT_FISCALISED without FDMS success (settings may store integrator credentials; that is not a fiscalisation claim)
- Historical tax review remains required (legacy CGT, VAT rate gap at 1 Jan 2026, VAT obligation vs historical GL 2101 41.85, CompanyAccount vs GL 4001)
- VAT return working paper is empty because the company is not VAT registered — no fake zero returns were created
- CGT and CGWT rates are unset; settlement remains review-blocked rather than silently taxed at 0

EXTERNAL / OUT OF SCOPE

- ZIMRA filing
- PAYE
- Corporate income tax
- Live FX
- Full trust-account proof including buyer subledgers, maintenance, unallocated receipts, per-owner books, and off-book custody

### 11. Final status

```
PASS WITH DOCUMENTED RISKS
```

Working tree was not committed. Modified and untracked Phase 7/8/8.1/8.2/8.3 source remains dirty at HEAD `8070b217` (including `PHASE8_TAX_TRUST_COMPLIANCE.md`, `TaxCompliancePage.tsx`, `runPhase83FinalSignOffTests.ts`, tax/trust services, and compiled `server/dist`). The user will decide when to commit. Untracked Phase 8/8.1/8.2 files were not deleted.

