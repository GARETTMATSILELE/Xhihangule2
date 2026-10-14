# Individual Dashboard — Payments, Reports, and Tax

**Current architecture:** see `INDIVIDUAL_ACCOUNTING_TAX_ARCHITECTURE.md`.  
**Phase B:** expenses, other income, and maintenance costs post through `individualAccountingService` (canonical `LandlordFinancialTransaction` → PropertyAccount projection). Rent still uses the shared payment orchestrator. Dashboard period cards use the selected period, not lifetime totals.  
**Phase C:** landlord and property tax profiles, rental tax regime, and a versioned `TaxRule` registry. Profiles do not calculate tax or rewrite history. Missing classification stays `ACCOUNTANT_REVIEW`.

Mantis is not ZIMRA-certified and does not file returns.

The individual workspace is a landlord record-keeping view. The owner collects rent for themselves. Agency commission, PREA splits, trust client money, CGT, CGWT, and ZIMRA return filing remain agency features.

## Scope

Workspace gate: `workspaceType === 'individual'` or `plan === 'INDIVIDUAL'`.

Primary UI: `client/src/pages/IndividualDashboard/`

Server: `server/src/services/individualWorkspaceService.ts`, `server/src/services/individualAccountingService.ts`, plus the shared payment engine (`createPaymentAccountant` → `postPaymentAccounting`).

---

## 1. How payments are generated

There are **two write paths**. Rent uses the shared Mantis payment engine. Expenses, bills, and maintenance use the individual accounting service.

### 1.1 Rent collection (canonical payment path)

**UI:** Finance → Rent Collection (`RentCollectionPage`)

The page loads properties, tenants, leases, and completed rental payments in parallel, then opens the shared `PaymentForm` with `individualMode`.

Submit path:

1. Form is forced to `paymentType: 'rental'`.
2. Manual property/tenant entry is disabled.
3. Commission is **not** taken from the form. Client `commissionPercent` is forced to `0`.
4. The matching active / expiring-soon lease is attached when property + tenant match.
5. Status is sent as `completed`.
6. Client posts to `POST /accountants/payments` (`paymentService.createPaymentAccountant`).

Server (`createPaymentAccountant`) then:

1. Resolves ledger type from `Property.rentalType` (individual properties are created as `management`).
2. Splits combined rent + levy when the property has a levy amount (`resolveCombinedRentalAllocation`).
3. Recalculates commission **on the server**. Client `commissionDetails` are discarded.
4. Individual properties are created with `commission: 0`, so:
   - `totalCommission = 0`
   - `vatOnCommission = 0`
   - `ownerAmount` ≈ full rent (levy portion is pass-through, not owner income)
5. Enforces remaining balance for the selected rental month (or advance-month exactness).
6. Saves a `Payment` with `status: 'completed'`.
7. After commit, calls `ensurePaymentAccountingPosted` → `postPaymentAccounting`.

Accounting posted for a completed, non-provisional rent payment:

| Artifact | Writer | Individual landlord result |
|---|---|---|
| Owner income | `propertyAccountService.recordIncomeFromPayment` | Posts `ownerAmount` as `rental_income` on the property ledger |
| Levy / pass-through | same writer | Levy collected is not owner income |
| Agent commission | `agentAccountService.syncCommissionForPayment` | Zero when commission is 0% |
| Company commission | `accountingIntegrationService.postCompanyCommission` | Zero agency share |
| Journal + VAT record | `accountingIntegrationService.syncPaymentReceived` | No VAT if company is not VAT-registered and commission is 0 |

Deposit-only payments (`amount = 0`, `depositAmount > 0`) are **not** posted as income. They go to the rental-deposit ledger only.

Receipts are generated from the Payment document (`GET /payments/:id/receipt/download`). The receipt PDF is a payment acknowledgement (company name, TIN if present, amount, reference). It is **not** a fiscalised tax invoice.

### 1.2 Individual-mode form behaviour

`PaymentForm` in individual mode:

- Locks payment type to rental (no sale, introduction, levy, or municipal types).
- Uses the logged-in user as the sole “agent” if the company has no agents.
- Hides manual property/tenant switches.
- Still collects method, amount, deposit, rental period, advance months, reference, and notes.
- Combined levy: if the property has a levy, the form pre-fills rent + levy and the server splits the receipt levy-first.

Overdue status on this page is **not** read from the server tax or accounting modules. It is derived in the browser (`rentCollectionStatus.ts`):

- Active / expiring-soon leases generate due months from lease start through today.
- Completed rental payments are allocated to `rentalPeriodMonth/Year` (or advance period range).
- Leftover cash is applied to the oldest outstanding months.
- Portfolio label is Overdue / Paid up to date / No overdue payments.

That client derivation can disagree with dashboard “outstanding rent”, which uses a simpler current-month formula (see §3).

### 1.3 Expenses, bills, and maintenance (canonical individual accounting)

These still do **not** create `Payment` documents and do **not** run `postPaymentAccounting`. They now go through `individualAccountingService`:

```
Validation → period gate → LandlordFinancialTransaction → PropertyAccount $push → AccountingEventLog
```

| Screen | API | What is written |
|---|---|---|
| Expenses | `POST /individual/expenses` | Canonical expense + property ledger projection |
| Bills & Levies | same endpoint | same, category Municipal / Levies / Insurance / Utilities |
| Maintenance “Convert To Expense” | `POST /individual/maintenance/:id/record-expense` | maintenance expense + request marked paid/closed |
| Edit / delete | reversal canonical row; original marked REVERSED | original amount is not rewritten |

Tenant deposits (`TENANT_DEPOSIT`) and capital works are **not** P&L. Deposits received on a rent Payment still go to `RentalDeposit` and are not owner income.

`postEntry` rules:

- Amount must be > 0.
- Income, expense, capital, and deposit categories are normalised by `individualAccountingCategories`.
- Idempotency key prevents duplicate canonical posts.
- Closed accounting periods reject ordinary posts (`assertPeriodAllowsPosting`).
- Archived / inactive property accounts refuse the ledger projection.

`POST /individual/income` uses the same service. Rent Collection does not use it.

### 1.4 Property setup that feeds payment math

When an individual landlord adds a property (`PropertyForm` + `individualMode`):

- `rentalType` is forced to `management`.
- `commission` is forced to `0`.
- Agency financial settings are hidden: commission %, VAT on commission, property VAT classification.

So a normal individual rent receipt is: **gross cash in → 0% commission → 0 VAT on commission → full rent to owner income**.

---

## 2. How reports are generated

**UI:** Reports (`ReportsPage`) plus export buttons on the property detail page.

The catalogue is defined in `constants.ts` `reportGroups`. Preview calls `GET /individual/reports/:type`. PDF / Excel / CSV open `/api/individual/reports/:type?format=...`.

All report types are built in **one function**: `IndividualWorkspaceService.getReport`.

That function always starts from `getAccounting()` → `getSummary()`, then maps property metrics into rows.

### 2.1 Report catalogue vs actual payload

Several cards share the same backend type. Labels in the UI are marketing names; the data is the type in the first column.

| Report type | UI labels that hit it | Row contents |
|---|---|---|
| `rent-collection` | Rent Collection, Tenant Ledger | expected / collected / outstanding rent and collection % for the **current calendar month** |
| `expense` | Expense Summary, Maintenance Summary | every non-income, non-opening-balance property-ledger line |
| `profit-loss` | Profit & Loss | per-property income, expenses, net, annualised net, ratios |
| `cashflow` | Cashflow | **same rows as profit-loss** |
| `tax-preparation` | Tax Summary | **same rows as profit-loss** |
| `property-performance` | Income Statement, Property Performance, Property Ledger | **same rows as profit-loss** |
| `occupancy` | Occupancy Report, Lease Summary | units occupied / vacant / occupancy % |

There is no separate tenant ledger, property ledger, cashflow statement, or tax working paper behind those extra labels. Preview is raw JSON of `{ reportType, rows, generatedAt }`.

### 2.2 Export formats

- **JSON:** `{ reportType, rows, generatedAt }`
- **CSV / Excel:** flattened CSV (`text/csv` or `application/vnd.ms-excel`). Excel is not a real `.xlsx` workbook.
- **PDF:** `pdf-lib` A4 pages listing `key: value` for each row. No company letterhead, no tax invoice layout, no fiscalisation mark.

### 2.3 Where dashboard and accounting numbers come from

`GET /individual/dashboard` and `GET /individual/accounting` share `getSummary()`.

For each company property:

1. Load the property account (empty stub if the ledger was never created).
2. Occupancy = tenant or active lease linked to the property.
3. `expectedRent` = `property.rent` if there is an active lease, else 0.
4. `collectedRent` = sum of **Payment** amounts with status completed/paid/success in the current calendar month.
5. `monthlyIncome` / `monthlyExpenses` = `PropertyAccount.totalIncome` / `totalExpenses` (**lifetime ledger totals**, despite the “monthly” / “this month” labels on the dashboard).
6. `netProfit` = those two totals.
7. `annualProfit` = `netProfit * 12` (annualises lifetime profit, not a year-to-date figure).
8. Charts bucket ledger transactions by calendar month (last 12 months).

Accounting page overview cards reuse the same summary and relabel them “Income / Expenses This Month”.

Property detail ledger (`GET /individual/properties/:id/ledger`) is the running property account with a computed running balance.

---

## 3. How tax is handled

### 3.1 What the individual dashboard actually does

**Tax Summary (`tax-preparation`) is a profit-and-loss extract, not a tax computation.**

It does not calculate:

- VAT on rent
- VAT on commission
- Input VAT on expenses
- Income tax / QPD
- PAYE
- Withholding tax
- CGT / CGWT
- ZIMRA return lines
- Fiscalised tax invoices

It lists per-property `income`, `expenses`, `netProfit`, `annualProfit`, `expenseRatio`, `profitabilityPercent`.

Individual Settings has Profile / Security / Notifications / Billing / Preferences. There is **no** company VAT registration, TIN, VAT number, or tax-rate screen in this workspace.

### 3.2 What still runs on the shared payment engine

Rent receipts still go through Phase 8 VAT **policy**, because they use `createPaymentAccountant`.

VAT on commission applies only when **all** of these are true:

1. Company `taxProfile.vatRegistered` is true on the payment date.
2. Supply treatment for the commission is standard taxable.
3. The property requested VAT on commission.
4. An effective-dated VAT rate exists.

Individual property creation hides those flags and sets commission to 0%, so a typical individual receipt results in:

- `applyVatOnCommission = false`
- `vatOnCommission = 0`
- `vatRateApplied` unused for rent (landlord rent is not treated as company taxable supply)

Residential dwelling rental is classified **EXEMPT** in the shared tax engine (`defaultSupplyTreatment('RESIDENTIAL_DWELLING')`). Landlord rent is owner income, not agency revenue. That matches Zimbabwe VAT treatment for residential dwelling rental, but the individual UI never asks the landlord to classify the property.

Commercial rental would default to `ACCOUNTANT_REVIEW` in the agency product. Individual landlords cannot set `propertyUseClass` / `vatSupplyTreatment` from this dashboard, so commercial VAT is not classified here.

### 3.3 Expenses and tax

Expense and bill posts are cash amounts on the property ledger. They do not:

- extract input VAT
- create `VatRecord` / `TaxRecord` lines
- hit GL 2101 VAT Payable
- appear on a ZIMRA VAT working paper

A landlord who is independently VAT-registered would need the Accountant / Tax Compliance workspace (or an external accountant) to prepare returns. The individual Tax Summary is a management P&L, not a ZIMRA return.

### 3.4 Receipts vs tax invoices

Rent receipts are payment acknowledgements. `paymentReceiptPdf` does not print VAT rate, VAT amount, or “TAX INVOICE”. Phase 8 fiscalisation (`NOT_FISCALISED` / FDMS) is an invoice path and is not used by this dashboard.

---

## 4. End-to-end picture

```
Record Rent (UI)
  → PaymentForm individualMode (commission 0%, type rental)
  → POST /accountants/payments
  → Payment (completed)
  → postPaymentAccounting
       → PropertyAccount income (ownerAmount)
       → agent/company commission (usually 0)
       → journal / VAT record (usually no VAT)

Add Expense / Bill / Maintenance cost
  → POST /individual/expenses or /maintenance/:id/record-expense
  → PropertyAccount expense only
  → no Payment, no VAT, no GL tax line

Dashboard / Accounting / Reports
  → getSummary() mixes:
       Payments (this month’s collected rent)
       PropertyAccount totals (lifetime income & expenses)
  → tax-preparation report = same P&L rows
```

---

## 5. Gaps and caveats (individual workspace)

5. **`monthlyIncome` / `monthlyExpenses` are period-filtered P&L** for the selected reporting period (default this calendar month). Year-to-date profit and annualised run rate are separate fields. Lifetime totals are no longer labelled “this month”.
6. **`annualProfit = netProfit × 12` has been removed.** Use `financialYearProfit` / `yearToDateProfit` or `annualisedRunRate`.
2. **Tax Summary is a duplicate of Profit & Loss.** It is not income-tax or VAT ready.
3. **Report labels over-promise.** Tenant Ledger, Property Ledger, Cashflow, Lease Summary, and Maintenance Summary reuse other types.
4. **Excel export is CSV** with an Excel content type.
5. **Two overdue calculations exist.** Rent Collection uses lease-month allocation; dashboard outstanding rent is `expectedRent − collectedThisMonth`.
6. **VAT / tax classification UI is hidden** for individual properties. Shared engine still runs; it will almost always conclude VAT = 0.
7. **Direct expenses skip the payment orchestrator.** They will not appear on payment reports, receipts, or tax journals.
8. **`annualProfit` is `netProfit × 12`**, which annualises whatever is currently in the lifetime totals.
9. The application **does not file with ZIMRA** from this workspace (or from the agency tax module).

---

## 6. Source map

| Concern | Files |
|---|---|
| Routes / shell | `client/src/pages/IndividualDashboard/index.tsx`, `constants.ts` |
| Rent UI | `client/src/pages/IndividualDashboard/pages/RentCollectionPage.tsx` |
| Overdue math | `client/src/pages/IndividualDashboard/utils/rentCollectionStatus.ts` |
| Payment form | `client/src/components/payments/PaymentForm.tsx` (`individualMode`) |
| Expenses / bills | `client/src/pages/IndividualDashboard/pages/FinancePages.tsx` |
| Reports UI | `client/src/pages/IndividualDashboard/pages/ReportsPage.tsx` |
| Client API | `client/src/services/individualWorkspaceService.ts`, `paymentService.ts` |
| Individual HTTP | `server/src/routes/individualRoutes.ts` |
| Summary, ledger, reports, expenses | `server/src/services/individualWorkspaceService.ts` |
| Payment create | `server/src/controllers/paymentController.ts` `createPaymentAccountant` |
| Accounting post | `server/src/services/paymentAccountingOrchestrator.ts` |
| VAT policy | `server/src/services/vatPolicyService.ts`, `server/src/services/tax/vatApplicability.ts` |
| Agency tax product (not this UI) | `PHASE8_TAX_TRUST_COMPLIANCE.md` |
