# Paynow production deployment

This guide is for the Mantis App Service named `mantisafrica`. The container serves the website and the API on the same host. Paynow must call that same host. `PAYNOW_MODE` is an application setting. It does not switch the integration between test and live on the Paynow dashboard.

Do not put integration keys, database connection strings, or poll URLs in this file, in git, or in frontend configuration.

## 1. Azure settings

Set these on the `mantisafrica` App Service, Production slot, as server-side application settings.

| Name | Purpose |
|---|---|
| `NODE_ENV` | `production`. The container already sets this. |
| `PAYNOW_MODE` | `test` while you are proving the flow. `live` only after an authorised go-live. |
| `PAYNOW_INTEGRATION_ID` | The Paynow integration id for the currency you charge. USD and ZWG need separate integrations. |
| `PAYNOW_INTEGRATION_KEY` | The integration key. Server-side only. |
| `PAYNOW_MERCHANT_EMAIL` | Required when `PAYNOW_MODE=test`. The Paynow login that owns the integration. Live checkout ignores this and uses the customer email. |
| `PAYNOW_RESULT_URL` | `https://www.mantisafrica.com/api/paynow/result` |
| `PAYNOW_RETURN_URL` | `https://www.mantisafrica.com/api/paynow/return` |
| `PUBLIC_BASE_URL` | `https://www.mantisafrica.com` |
| `CLIENT_URL` | `https://www.mantisafrica.com` |
| `CANONICAL_HOST` | `www.mantisafrica.com`. Requests that are already on this host stay there. |
| `REDIRECT_FROM_HOSTS` | Not required for a test that starts on `https://www.mantisafrica.com`. Optional: `mantisafrica.azurewebsites.net` if that Azure hostname should redirect to `www`. The apex name is not part of this test. |
| `ALLOW_PUBLIC_SIGNUP` | `true` only while you are accepting new companies. Missing or any other value keeps production signup closed. |
| `SIGNUP_EMAIL_ALLOWLIST` | Optional comma-separated emails. When set, only those addresses can register. Leaving it empty does not open signup. Unrestricted signup is only `ALLOW_PUBLIC_SIGNUP=true` with this value blank. A non-blank value with no valid email addresses allows nobody. |
| `MONGODB_URI` | The Azure Cosmos connection for this App Service. Do not point it at a laptop database. |

`POST /api/paynow/result` is unauthenticated because Paynow cannot send your user token. Hash verification is what authenticates it. Do not put that route behind an extra login wall.

The GitHub workflows in this repository do not create Azure Front Door. The live `www.mantisafrica.com` name is a CNAME to the Front Door endpoint `default-webapp-endpoint-c40e861c-fce3gafpadgfckac.z01.azurefd.net`. Checkout from `www.mantisafrica.com` sends Paynow to `www.mantisafrica.com`. A request that arrives on the `azurewebsites.net` hostname is accepted only when the result URL host is the canonical host. Any other host is rejected, so a session cannot be stored on one server while Paynow notifies another.

There is no staging slot in the workflows. A staging test needs its own hostname, its own database, and result and return URLs on that same hostname.

## 1a. Production signup

`SAAS_ONBOARDING_V2` and `REACT_APP_SAAS_ONBOARDING_V2` are not read by the current server. The signup page always calls `POST /api/onboarding/start`. Paid plans always create a pending company and a payment session. The browser cannot choose the price. A trial does not start Paynow. The first user of a new company is that company's `admin`, not a system administrator.

`GET /api/onboarding/availability` tells the signup page whether registration is open, whether an allowlist is active, and that paid registration requires payment. It does not return email addresses, Paynow settings, database names, or connection details. Confirm in Azure that `MONGODB_URI` is the Cosmos connection for this App Service. Use `npm run paynow:preflight` on the server for callback diagnostics.

Checkout from `https://www.mantisafrica.com` is sufficient for the controlled test. It does not require `mantisafrica.com` to resolve or to be listed in `REDIRECT_FROM_HOSTS`. The result and return URLs stay on `www`, so Paynow notifies the same application that created the session. A request host other than `www.mantisafrica.com` is rejected unless it is the production `*.azurewebsites.net` hostname, or it is explicitly listed in `REDIRECT_FROM_HOSTS`, and the canonical host equals the result host. `X-Forwarded-Host` is ignored. A development process cannot send callbacks to `www.mantisafrica.com`, `mantisafrica.com`, or `*.azurewebsites.net`.

After deployment:

1. Set `ALLOW_PUBLIC_SIGNUP=true` and, for a controlled test, `SIGNUP_EMAIL_ALLOWLIST` to the address you will use.
2. Open `https://www.mantisafrica.com/signup?plan=INDIVIDUAL&checkout=paid&cycle=monthly`.
3. Confirm the form is visible. With signup left unset, the page says `Public signup is disabled` and does not submit.
4. `GET https://www.mantisafrica.com/api/onboarding/availability` should show `signupEnabled` true and `paidRegistrationRequiresPayment` true. It does not include a database name, connection status, email addresses, credentials, or a connection string. Confirm the Cosmos connection in the Azure application setting `MONGODB_URI`, not in this response.
5. Submit the form with the allowlisted email. The response creates a pending company. Continue to checkout only after the Paynow preflight passes.
6. Set `ALLOW_PUBLIC_SIGNUP=false` when the test is finished. Existing companies can still sign in.

Paid registration does not activate the subscription. Activation still requires a verified Paynow result on this same server.

## 1b. Apex domain, separate from the Paynow test

On 28 October 2026, `mantisafrica.com` resolved to `15.197.225.128` and `3.33.251.168`. A browser request to `https://mantisafrica.com/` received a 301 to `https://www.mantisafrica.com` from an AWS host. A browser request to `https://mantisafrica.com/signup` received a 404 from that host and was not redirected. This is a website-routing concern. It does not block checkout, signup, or Paynow callbacks on `https://www.mantisafrica.com`. No DNS or Front Door change is required before the controlled test. The signup query is kept when the browser is already on `www`. A GET or HEAD redirect from a host listed in `REDIRECT_FROM_HOSTS` also keeps the path and query. Paynow POST requests are not redirected.

## 2. Confirm the Paynow dashboard

`PAYNOW_MODE=test` does not change the integration on Paynow.

1. Sign in to Paynow as the merchant that owns the integration.
2. Open the integration used by `PAYNOW_INTEGRATION_ID`.
3. Confirm whether that integration is in test mode or live mode. The application cannot read this setting.
4. For a test payment, the integration must stay in test mode. Only that merchant account can complete **TESTING: Faked Success**, and the test checkout sends `PAYNOW_MERCHANT_EMAIL` as `authemail`.
5. Do not switch the integration to live until you intend to take real money.

A previous payment on this integration returned `TESTING: Faked Success`. Treat the integration as still in test mode until you see otherwise in the dashboard.

## 3. Run the preflight

From `server/`:

```bash
npm run paynow:preflight
```

The command prints hosts, the path, the application mode, and issue codes. It does not print the integration key. Exit 0 means this process may create a test checkout. Exit 1 means checkout will be refused.

Before a production test, `GET https://www.mantisafrica.com/api/paynow/status` should show:

- `mode` equal to the mode you set
- `callbackReady` true
- `issues` empty
- `resultHost` `www.mantisafrica.com` and `resultPath` `/api/paynow/result`
- `providerDashboardModeChecked` false

An empty unsigned POST to `/api/paynow/result` should return 401. That only proves the route is reachable and hash verification is on.

## 4. Run a controlled test payment

Do this only after the preflight passes on the deployed server and you have confirmed the Paynow integration is in test mode.

1. Use a new company on the production site. Do not reuse the 19 October 2026 reference `SUBS-6ad5f314dc4ca083c259d767`.
2. Start subscription checkout in the browser. The server stores the session, then sends Paynow the production result URL.
3. On the Paynow page, sign in as the merchant and choose **TESTING: Faked Success**.
4. In the App Service log stream, look for `paynow_result_received` and `paynow_result_processed` with the new `SUBS-` reference. Do not expect the integration key or the poll URL in those lines.
5. Confirm one `payment.verified` audit for that payment session, with `paynowMode` `test`.
6. Confirm the payment session is `reconciled`, the subscription is active, and the company has left `PENDING_PAYMENT`.
7. Deliver the same result notice again, or refresh the return page. The second notice is `duplicate`. The return page only redirects to `/billing/return` and does not activate the subscription.

A test-mode payment activates the subscription in the database that stored the session. It is labelled `testTransaction`. It cannot complete a session that was stamped `live`, and a live server will not complete a session that was stamped `test`. Changing `PAYNOW_MODE` between checkout and the callback blocks activation until the mode matches again. A failed callback leaves the webhook receipt retryable. Paynow can send the notice again.

## 5. Switch to live mode

1. Finish at least one test-mode payment on production and confirm the audit, session, and subscription above.
2. In the Paynow dashboard, switch the integration to live only when you are ready to take real money.
3. Set `PAYNOW_MODE=live` on the App Service and restart it.
4. Run the preflight again. Live mode does not require `PAYNOW_MERCHANT_EMAIL`. Checkout uses the customer email.
5. Take a small real payment only after that restart. The application still cannot see the dashboard mode, so the dashboard and `PAYNOW_MODE` have to be changed together.

## 6. A payment Paynow calls Paid while Mantis is still pending

From `server/`, against the database you mean to inspect:

```bash
npm run paynow:diagnose -- SUBS-reference
```

The command only reads. `writeAllowed` is always false.

- `absent`: this database has no session. Paynow's Paid status does not mean you should create one.
- `unreconciled`: the session is still `pending` or `provider_created` and has no `payment.verified` audit. The callback was not applied here. The usual cause is that checkout and the result URL were on different servers.
- `reconciled`: the session is already paid or reconciled. Leave it alone.
- `ambiguous`: more than one session has the reference. Do not choose one by hand.

The 19 October 2026 session `SUBS-6ad5f314dc4ca083c259d767` (Paynow reference `65682257`) was created in the local `property-management` database while its result URL pointed at `https://www.mantisafrica.com`. Do not mark it paid, do not run confirm for it, and do not repair it from production. A later reconciliation needs a separate authorised process and verified evidence on the database that owns the session.

## 7. Local development

Checkout is refused when the result host is `www.mantisafrica.com` or `*.azurewebsites.net` and the request host is localhost. That is the failure that left the October session unreconciled.

`PAYNOW_CALLBACK_HOST` lets an isolated test harness, or a non-production tunnel you choose, receive callbacks. It cannot be set to the production hosts above. Do not publish the local development server to the internet just to receive a callback.

Automated tests set `PAYNOW_DISABLE_LOCAL_CONFIG=1` and use integration id `90001`. They do not read `server/config/local.paynow.json` and they do not call Paynow.
