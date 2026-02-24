# Runtime Roles (API vs Worker)

This backend now supports role-based startup to separate user-facing HTTP traffic from background workloads.

## Environment variables

- `APP_ROLE`
  - `api` (default): runs HTTP API server
  - `worker`: runs background jobs only (no HTTP listener)
  - `all`: runs both HTTP + background jobs in one process
- `ENABLE_SYNC_SCHEDULES`
  - Enables/disables scheduled sync jobs
- `ENABLE_TRUST_BACKGROUND`
  - Enables/disables trust event listener and trust reconciliation cron
- `ENABLE_STARTUP_MAINTENANCE`
  - Enables/disables startup ledger maintenance

## Defaults

- Production + `APP_ROLE=api`:
  - Background jobs are disabled by default to protect API availability.
- Production + `APP_ROLE=worker`:
  - Background jobs are enabled by default.

## Scripts

- API:
  - `npm run start:prod`
- Worker:
  - `npm run start:prod:worker`

## Recommended Azure deployment

1. Deploy API app service with `APP_ROLE=api`.
2. Deploy a separate worker app service using the same image with `APP_ROLE=worker`.
3. Keep public traffic only on the API app.
4. Keep worker app private/internal (no public routing required).
