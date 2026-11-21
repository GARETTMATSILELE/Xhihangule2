# Dodo Payments subscription checkout

Dodo Payments is an optional card checkout for Mantis software subscriptions. Paynow remains the local payment provider. Dodo payments are not rental receipts, tenant allocations, trust movements, owner settlements, rental commission, rental VAT, or property tax obligations.

The integration stays off until the App Service settings below are present. Missing Dodo settings do not stop the application or Paynow.

## App Service settings

Set these on the `mantisafrica` App Service, Production slot. They are server-side settings. Do not put the API key or webhook key in the frontend.

| Setting | Value |
|---|---|
| `PAYNOW_ENABLED` | `true`. Unset also leaves Paynow available. |
| `DODO_PAYMENTS_ENABLED` | `false` until the checklist below is complete. `true` turns the provider on without another code deployment. |
| `DODO_PAYMENTS_MODE` | `test` until a controlled live payment is approved. `live` uses `https://live.dodopayments.com`. |
| `DODO_PAYMENTS_API_KEY` | Test key with test mode. A different live key with live mode. |
| `DODO_PAYMENTS_WEBHOOK_KEY` | The webhook endpoint signing secret from Developer → Webhooks. This is the SDK `webhookKey`. |
| `DODO_PAYMENTS_RETURN_URL` | `https://www.mantisafrica.com/billing/return` |
| `DODO_PAYMENTS_PRODUCT_MONTHLY` | Dodo subscription product ID whose USD price and monthly interval match the Mantis plan price. |
| `DODO_PAYMENTS_PRODUCT_QUARTERLY` | Optional. A monthly interval with frequency count 3. Also requires `quarterlyPrice` on the Mantis plan. |
| `DODO_PAYMENTS_PRODUCT_ANNUAL` | Dodo yearly subscription product ID. |

A plan-specific product overrides the shared one. The name is `DODO_PAYMENTS_PRODUCT_<PLAN>_<MONTHLY|QUARTERLY|ANNUAL>`, for example `DODO_PAYMENTS_PRODUCT_SME_MONTHLY`.

The webhook endpoint is `https://www.mantisafrica.com/api/billing/dodo/webhook`. Subscribe it to `payment.succeeded`, `payment.failed`, `payment.processing`, `payment.cancelled`, the subscription lifecycle events, and `refund.succeeded`. The handler verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature` with the official SDK `webhooks.unwrap` method before it reads the event.

## Live activation status

Dodo has approved live payments for KIBYTECH PRIVATE LIMITED. The application code accepts `DODO_PAYMENTS_MODE=live` and sends the official SDK to `https://live.dodopayments.com` (`environment: 'live_mode'`). Accepted mode values are `live` and `test`. Any other value is invalid and leaves Dodo unavailable.

Live credentials and live product IDs are not committed to this repository and are not in the frontend. Local development reads them from gitignored `server/.env.local`. Production reads them only from the `mantisafrica` App Service settings. Until the four product settings exist there, leave `DODO_PAYMENTS_ENABLED` unset or `false`. Paynow continues with its existing settings. `PAYNOW_ENABLED` defaults to true when it is unset.

`DODO_PAYMENTS_MODE` defaults to `test` when it is unset. A live key must be paired with `live`. A test key must stay on `test`.

## Prices the live products must match

Checkout loads the active plan price on the server. A system-admin plan row overrides the catalog below. The catalog has no quarterly price. Quarterly checkout stays unavailable until that plan has `quarterlyPrice` and a matching Dodo product.

| Plan | Monthly | Annual | Currency |
|---|---:|---:|---|
| INDIVIDUAL | 20.00 | 240.00 | USD |
| SME | 250.00 | 3000.00 | USD |
| ENTERPRISE | 600.00 | 7200.00 | USD |

These prices are different, so one shared `DODO_PAYMENTS_PRODUCT_MONTHLY` cannot represent every plan. Create a separate live Dodo subscription product for each plan and cycle that will be sold. The product must be recurring, USD, and the interval must be one month or one year. Set the matching variable:

- `DODO_PAYMENTS_PRODUCT_INDIVIDUAL_MONTHLY`
- `DODO_PAYMENTS_PRODUCT_INDIVIDUAL_ANNUAL`
- `DODO_PAYMENTS_PRODUCT_SME_MONTHLY`
- `DODO_PAYMENTS_PRODUCT_SME_ANNUAL`

The server retrieves the product before checkout and rejects it when the amount, currency, or interval differs. It does not change the Mantis price. Enterprise stays with sales. Direct Enterprise checkout also requires `ENTERPRISE_DIRECT_CHECKOUT=true`, which is not set for this launch.

## Enable live processing

1. Dodo merchant approval for KIBYTECH PRIVATE LIMITED is recorded.
2. Create the live subscription products and confirm each price, currency, and billing interval against the table above, or against the current system-admin plan row if that row differs. Copy each product ID into the matching App Service setting. Do not invent an ID.
3. Store the live API key, live webhook signing secret, live product IDs, and return URL on the `mantisafrica` App Service only.
4. Set `DODO_PAYMENTS_MODE=live` and `DODO_PAYMENTS_ENABLED=true`, then restart the app. Leave every `PAYNOW_*` setting unchanged.
5. Complete one controlled live payment. Activation happens from the verified webhook or from a server-side retrieve of that payment. The browser return URL does not activate the subscription by itself.
6. Leave Paynow enabled. A failed Dodo attempt must not be retried through Paynow unless the customer chooses Paynow.

Test mode shows a test-mode notice in checkout. Test keys stay on `DODO_PAYMENTS_MODE=test` and must not be copied into the live settings.

Automated tests use a mocked Dodo client and the isolated database `mantis_dodo_payments_test`. They do not call Dodo.
