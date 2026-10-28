# Production SaaS Hardening Notes

## Architecture Summary

Mantis now has a compatibility-safe SaaS foundation: tenant context is resolved from the current database relationship while legacy JWT `companyId` claims continue to work, new onboarding data is stored in retry-safe sessions, and billing activation flows through payment sessions before subscriptions and companies are activated.

New registrations can use the feature-flagged v2 flow:

1. `POST /api/onboarding/start` creates the user, company, pending subscription, onboarding session, billing payment, and payment session.
2. Checkout sends the `paymentSessionId` to Paynow.
3. Paynow IPN or cash voucher redemption activates the shared payment session.
4. Activation updates the subscription, company tenant status, onboarding status, and billing records.
5. Pending workspaces enter `/workspace-setup` for progressive company basics, preferences, portfolio/team prompts, and final initialization.

## Migration Notes

- Existing companies and users are not rewritten by default.
- New fields are nullable or defaulted for compatibility.
- Run `npm run saas:indexes` from `server` after backup and staging validation. The script creates partial unique indexes and logs duplicate legacy records instead of destructive cleanup.
- Do not drop old indexes until duplicate reports have been reviewed.

## Backward Compatibility

- Legacy `/api/auth/signup` remains available.
- Existing refresh/access tokens remain accepted.
- `companyId` in JWT is still emitted for legacy clients, but middleware now resolves current company context from DB when available.
- Existing lowercase subscription statuses remain valid; new lifecycle logic maps into the same records.
- Existing companies without explicit pending onboarding status are not redirected into the workspace setup wizard.

## Rollout Steps

1. Deploy schema/model additions with `SAAS_ONBOARDING_V2=false`.
2. Run backups and validate restore.
3. Run `npm run saas:indexes` in staging, then production.
4. Enable route-security changes in staging and verify active tenant workflows.
5. Enable `SAAS_ONBOARDING_V2=true` only for controlled signup testing.
6. Monitor onboarding failures, payment sessions, webhook receipts, and audit logs.

## Risk Areas

- Existing public integrations that used `/api/companies` now require system-admin authentication.
- Paynow callback payload names must be validated against production IPN samples.
- Legacy companies with duplicate legal identifiers will need manual cleanup before unique indexes can be fully enforced.
- Broad tenant-safe query migration should continue controller by controller.

## Recommended Environment Variables

- `ALLOW_PUBLIC_SIGNUP=true` only when intentionally accepting signups. The server does not read `SAAS_ONBOARDING_V2`.
- `SIGNUP_EMAIL_ALLOWLIST` when a production test should accept only named addresses.
- `COOKIE_DOMAIN=.mantisafrica.com` in production.
- `JWT_SECRET`, `JWT_REFRESH_SECRET` with strong rotated secrets.
- `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `PAYNOW_RESULT_URL`, `PAYNOW_RETURN_URL`.
- `MONGODB_URI`, `ACCOUNTING_DB_URI`.
- `COMPANY_CONTEXT_CACHE_TTL_MS=60000`.

## Azure Deployment Hardening

- Use deployment slots and warm-up checks before swap.
- Store secrets in Key Vault or App Service configuration, not source files.
- Enable HTTPS-only, secure cookies, and managed identity where possible.
- Use Application Insights for request correlation using `X-Request-Id`.
- Configure autoscale and database connection limits conservatively.

## Monitoring Recommendations

- Alert on `FAILED_SETUP`, `SUSPENDED`, failed Paynow webhook receipts, and duplicate index migration warnings.
- Track signup-to-payment conversion, payment-session age, and subscription status counts.
- Review `audit_logs` for login failures, tenant suspension/reactivation, company creation, and payment activation.
- Track workspace setup completion percentage and time from `INITIALIZING_WORKSPACE` to `ACTIVE`.

## Dashboard Segmentation Strategy

- `INDIVIDUAL`: keep the dashboard lightweight and focused on properties, occupancy, overdue rent, lease expirations, recent payments, and maintenance.
- `SME`: add team activity, agent performance, collections views, workflow queues, and approval-focused prompts.
- `ENTERPRISE`: emphasize portfolio analytics, audit alerts, operational KPIs, advanced permissions, and support/integration readiness.

## Feature Gating Strategy

- Backend remains the enforcement boundary for tenant context, active subscription checks, and plan limits.
- Frontend feature gates hide or soften unavailable modules using plan defaults plus company-specific feature flags.
- Usage meters should be informational first, with upgrade prompts reserved for limit-adjacent moments.

## Backup Strategy

- Take a full MongoDB backup before every schema/index rollout.
- Verify restore into staging before production rollout.
- Keep pre-index duplicate reports with the release artifact.
- Retain daily backups and point-in-time recovery according to production RPO/RTO.
