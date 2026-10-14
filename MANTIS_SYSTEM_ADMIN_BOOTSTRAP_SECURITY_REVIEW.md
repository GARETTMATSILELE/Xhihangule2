# MANTIS SYSTEM ADMIN BOOTSTRAP — SECURITY REVIEW

Date: 18 September 2026

Scope: `server/src/index.ts` function `initializeDatabaseBackedServices`.

This review describes behaviour. It does not repeat secrets found in source.

## Current behaviour

On every successful database-backed startup, after Mongo is available, the API:

1. Looks up a user by a **hardcoded personal email address** embedded in `server/src/index.ts`.
2. If the user does not exist, **creates** a user with:
   - `role: 'admin'`
   - `roles: ['admin', 'system_admin']`
   - `isActive: true`
   - a **hardcoded plaintext password** in source
   - **no `companyId`**
3. If the user exists, it **mutates** the record on every boot until it matches that template:
   - forces `role` to `admin`
   - ensures `system_admin` is present in `roles`
   - forces `isActive: true`
   - **resets the password** if it does not match the hardcoded value
4. The block is wrapped in try/catch. Failure is logged; the server continues.
5. Comments in source state it **runs in all environments** and is **idempotent**.
6. It is **deterministic**: same email, same password, same roles on every start.

It is not limited to development. It is not gated on `NODE_ENV`, `ECOSYSTEM_ENABLED`, or a bootstrap flag.

## Security implications

1. **Secret in source.** Anyone with repository, backup, or build-artifact access knows a standing administrator password. Treat that credential as compromised.
2. **Password rollback.** An operator who rotates the password will have it **silently restored** on the next process start.
3. **Cannot disable the account.** `isActive` is forced true on boot.
4. **Privilege floor.** The account is always `admin` + `system_admin`, even if an operator tried to reduce roles.
5. **Global identity.** Missing `companyId` means this is a platform-level principal, not a company user.
6. **Ecosystem interaction.** `system_admin` is not an ecosystem portal role. The bootstrap user is not a tenant/contractor. However, `admin` is treated as agency staff by ecosystem middleware (`requireAgencyStaff`, `requireOwnerOrAgency`). If this user is later given a `companyId`, they can act as agency staff for that company. As a global `system_admin`, they can already use system-admin routes.
7. **Logs.** Startup logs print the email and user id, which aids discovery.

This is **not** an ecosystem feature. It is a pre-existing application bootstrap.

## Production implications

Unsafe for production as written.

- Production processes that connect to Mongo will create or repair this user.
- Incident response cannot reliably disable or re-password the account while this code remains.
- Source control and CI logs become a credential distribution channel.

**Release classification: BLOCKER for production enablement of this codebase until remotediated.** It does not by itself mean the ecosystem overlay is defective. It does mean a production deploy of `src/index.ts` in its current form is not a safe control plane.

## Company-isolation implications

- The bootstrap user is **outside** company tenancy (`companyId` unset).
- Ecosystem `requireFlag` derives company from `req.user.companyId`. Without a company, company-scoped ecosystem flags do not attach to this user.
- System-admin routes are global by design. This account is intended to bypass company isolation for platform administration.
- Risk is **platform takeover**, not “Owner A sees Owner B’s quote.” If system-admin routes can impersonate or mutate companies, this credential is a master key.

## Recommended remediation

Do **not** delete the user blindly in production without an access-recovery plan.

Do **not** leave the password in source.

Recommended sequence:

1. **Stop writing the secret.** Gate the entire block behind an explicit opt-in, for example `ALLOW_SYSTEM_ADMIN_BOOTSTRAP=true`, and refuse to run it when `NODE_ENV=production`.
2. **Stop resetting passwords on boot.** Never force a password from source. If a break-glass user is required, create it only when missing, using a secret from the environment or a secrets manager, and never overwrite a changed password.
3. **Rotate.** Assume the current hardcoded password is public. Disable or rotate the account after the bootstrap is gated.
4. **Least privilege.** `system_admin` should not also need a standing `admin` company role unless a named operator requires both.
5. **Audit.** Log bootstrap create/update as a security event with actor `startup`, not only `console.log`.
6. **Keep ecosystem flags off** until this is gated. A globally enabled ecosystem plus a known admin password is a worse combination than either alone.

No code change was made to this bootstrap in the release-gate pass, per instruction not to rewrite it blindly.

## Release-gate confirmation (18 September 2026)

The company-flag-only API process (`npm run dev` with `ECOSYSTEM_ENABLED` and per-flag env vars unset) still executed this block after Mongo connected. Log line: hardcoded system admin user already up to date. The account was **not** deleted. Classification is unchanged: **BLOCKER for production enablement of this codebase**, not an ecosystem overlay defect.
