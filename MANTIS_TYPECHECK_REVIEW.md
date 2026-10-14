# MANTIS TYPECHECK REVIEW

Date: 18 September 2026

Command inspected from `server/package.json`: `"build": "tsc"`.

Verification command: `npx tsc --noEmit --pretty false` in `server/`.

## Summary

A full `tsc --noEmit` run after the rating-guard fix completed with **EXIT:0** (`npx tsc --noEmit --pretty false` then `$LASTEXITCODE`).

An earlier log captured one **ecosystem-caused** diagnostic, which was fixed before the passing run:

| Error | File | Cause | Pre-existing? | Ecosystem-related? | Production impact | Recommended action |
| --- | --- | --- | --- | --- | --- | --- |
| TS2322 `boolean \| null` not assignable to `boolean` | `server/src/ecosystem/services/maintenanceWorkflowService.ts` | `ownerRecord && ...` in rating participation check | No — introduced in hardening | Yes | Would block `server` `tsc` build | Fixed with `Boolean(...)` |
| Previously reported tax-service failures | tax services | Not reproduced; full `tsc` EXIT:0 | Claimed pre-existing | No | None in this pass | Do not rewrite tax in ecosystem work |

## Ecosystem-specific note

`notificationService.ts` previously used incorrect relative imports and `Promise<void>` provider stubs. Those were corrected earlier. The only overlay type error in this hardening pass was TS2322 on the rating participation check; it is fixed. Full `tsc` now exits 0.

Windows note: piping `tsc` through `Out-File` can report `$LASTEXITCODE` 0 even when `tsc` failed. Confirm with `npx tsc --noEmit` then `Write-Host $LASTEXITCODE` without a pipeline.
