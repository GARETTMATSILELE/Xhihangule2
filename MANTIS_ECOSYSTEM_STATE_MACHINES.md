# MANTIS ECOSYSTEM — STATE MACHINES

Date: 18 September 2026

Arbitrary jumps are rejected with `INVALID_STATE_TRANSITION` (HTTP 400) unless a more specific 403/409 is used for authorisation.

Source of truth: `server/src/ecosystem/workflowMachine.ts` plus service guards.

---

## Viewing

Statuses: REQUESTED, UNDER_REVIEW, CONFIRMED, RESCHEDULED, COMPLETED, CANCELLED, DECLINED

| From | Allowed next |
| --- | --- |
| REQUESTED | UNDER_REVIEW, CONFIRMED, DECLINED, CANCELLED, RESCHEDULED |
| UNDER_REVIEW | CONFIRMED, DECLINED, CANCELLED, RESCHEDULED |
| CONFIRMED | COMPLETED, CANCELLED, RESCHEDULED |
| RESCHEDULED | CONFIRMED, DECLINED, CANCELLED, COMPLETED |
| COMPLETED | (terminal) |
| CANCELLED | (terminal) |
| DECLINED | (terminal) |

Notifications: request → tenant + agency staff; confirm / reschedule / decline → tenant.

---

## Application

Statuses: DRAFT, SUBMITTED, UNDER_REVIEW, MORE_INFORMATION_REQUIRED, APPROVED, DECLINED, WITHDRAWN, LEASE_PREPARATION, LEASE_SIGNED

| From | Allowed next |
| --- | --- |
| DRAFT | SUBMITTED, WITHDRAWN |
| SUBMITTED | UNDER_REVIEW, WITHDRAWN, MORE_INFORMATION_REQUIRED |
| UNDER_REVIEW | APPROVED, DECLINED, MORE_INFORMATION_REQUIRED, WITHDRAWN |
| MORE_INFORMATION_REQUIRED | SUBMITTED, UNDER_REVIEW, WITHDRAWN, DECLINED |
| APPROVED | LEASE_PREPARATION, DECLINED |
| LEASE_PREPARATION | LEASE_SIGNED, DECLINED |
| DECLINED / WITHDRAWN / LEASE_SIGNED | (terminal) |

Tenants cannot change status except submit/withdraw via upsert. Agent notes are stripped from tenant DTOs. Snapshot is captured at submit and is not rewritten.

---

## Maintenance (ecosystem workflow)

Statuses: REPORTED → UNDER_REVIEW → QUOTE_REQUESTED → QUOTE_RECEIVED → OWNER_APPROVAL → APPROVED → AUTHORISED → SCHEDULED → WORK_IN_PROGRESS → COMPLETED → TENANT_CONFIRMATION → CLOSED

Also: DECLINED, REOPENED, CONTRACTOR_ASSIGNED.

Closed and declined are not free-form jumps from REPORTED to COMPLETED.

Legacy `MaintenanceRequest.status` is mapped via `LEGACY_STATUS_FROM_ECOSYSTEM`. Existing non-ecosystem requests keep `ecosystemWorkflow.enabled = false`.

---

## Quote

Statuses: DRAFT, INVITED, SUBMITTED, UNDER_REVIEW, SHORTLISTED, SELECTED, SENT_TO_OWNER, OWNER_APPROVED, OWNER_DECLINED, EXPIRED, WITHDRAWN

Selection uses a conditional update so two agents cannot both select competing quotes into a sent-to-owner state.

OWNER_APPROVED quotes are locked. Additional cost requires a **change order**, not an overwrite.

---

## Owner approval

Decisions: APPROVE, DECLINE, REQUEST_CHANGES, REQUEST_ANOTHER_QUOTE

Recorded on `OwnerQuoteDecision` with actor, timestamp, quote version, and comment.

Concurrent duplicate decisions for the same owner/quote/version are unique-indexed.

Owner can only decide the agent-selected quote (`ecosystemWorkflow.selectedQuoteId`) while it is `SENT_TO_OWNER`.

---

## Contractor job

Statuses: INVITED → QUOTE_SUBMITTED → SELECTED → AUTHORISED → ACCEPTED → SCHEDULED → WORK_IN_PROGRESS → COMPLETED

Work start / complete requires:

- owner approval id when company `maintenanceApprovals` is not disabled
- agent `authorisedBy` + `authorisedAt`

`job.status === AUTHORISED` is **not** treated as owner approval.

---

## Change order

Statuses: REQUESTED → AGENT_REVIEW → OWNER_APPROVED | OWNER_DECLINED

Original quote amount is not mutated. Audit stores original amount, additional requested amount, and decision.

---

## Notification

Channels: IN_APP, EMAIL, SMS, WHATSAPP

Statuses: QUEUED, SENT, DELIVERED, FAILED, SKIPPED

Unconfigured SMS/WhatsApp → SKIPPED (`channel_unconfigured`). Provider throw → FAILED with reason. Idempotency key is unique per event+channel. SENT/SKIPPED are not duplicated; FAILED may be retried by replacing the failed delivery row.
