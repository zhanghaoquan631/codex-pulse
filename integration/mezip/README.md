# ME.zip integration

The original ME.zip pages, appearance, capture engine and data stay on the computer unchanged. The redesigned interface is a separate copy in Pulse's `public/mezip`. The Pulse collector makes authenticated outbound requests to the existing site; no inbound port, tunnel URL or browser pairing is required. Remote history and commands require the site's owner account. Public Token, website and credit views retain their existing audience.

From the Pulse checkout, run only:

```powershell
node integration/mezip/build-remote.mjs "C:/Users/your-user/Documents/Codex/2026-08-16/x-github-ai/work/me-zip/apps/web/public"
```

The argument is a **read-only source**. The builder reads the original HTML/CSS/JS, applies the theme and grouped navigation in memory, fixes legacy navigation in the copy, and writes only to Pulse's `public/mezip`. It supplies theme assets from this integration directory, so the original ME.zip pages need no installation or modifications. Relative sibling asset links remain relative. The hosted copy retains business DOM and scripts while delaying script execution until owner authentication and adapting API requests to the command channel. Run this command again when the original pages or integration assets change; unchanged output is not rewritten.

`install-theme.mjs` provides the pure `applyTheme()` transformation used by the builder. Its optional command-line utility accepts **only the exact independent Pulse `public/mezip` directory**, refuses redirected directories/files, and rejects an already bridged copy to avoid bypassing its authentication gate. Never point it at the original ME.zip project; that target is rejected. Normal builds do not need to call the installer separately.

The cloud channel stores temporary command/result envelopes; canonical records remain in ME.zip. The local SQLite journal retains receipts for seven days, checks command expiry before execution and does not repeat an interrupted write. Failures block the old pages' offline-write fallback; reconnection reloads canonical data. Existing local pages retain their original browser fallback.

Validation: `node --test collector/mezip.test.mjs`, TypeScript check, production build, and `node integration/mezip/bridge-api.test.mjs` against an isolated local Worker. The API test expects port 43911, test owner `mezip-test@example.invalid`, ingest token `isolated-mezip-test`, and the Drizzle schema in an isolated database. It never connects to production. Its narrowly scoped retry handles a known local Wrangler plaintext restart response after rejecting an unread request body.

On 2026-09-15, the isolated hosted preview read the existing 118 timeline entries, opened all 10 modules, and rejected a test write without leaving a saved record. Desktop/mobile layout checks passed. The real collector restarted successfully through its existing guardian, and normal Token upload resumed. Publishing to the existing Sites project is still pending its owner's connector access; `http-404` in the local ME.zip bridge status is expected until that version is published. Do not report the cloud integration as live until `/api/mezip/status` and the published UI are verified.
