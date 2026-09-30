# Chaoshan Atlas integration

The original application is `chaoshan-3d-atlas-v5`, served locally on port 5242. This integration builds a separate deployable copy without changing the original project or its running server.

```powershell
node integration/chaoshan-atlas/build.mjs [optional-original-source-directory]
node integration/chaoshan-atlas/check-cdn.mjs [optional-original-source-directory]
node integration/chaoshan-atlas/verify.mjs
```

The original source directory needs its existing pinned Vite 6.4.3 / Three.js 0.180.0 installation. The builder uses those dependencies read-only, compiles the map, copies the game runtime, and writes only `public/local-apps/chaoshan-atlas` and reports in this integration directory. Source hashes and the complete sprite URL/integrity inventory are recorded in `build-report.json`.

Entrypoints:

- Map: `/local-apps/chaoshan-atlas/index.html`
- Game: `/local-apps/chaoshan-atlas/adventure/index.html`

Map assets, photo catalogs, terrain, sky textures, game source modules, vendor Three.js, fonts, all 1,593 animal manifests and previews are hosted together. The 1,593 full animal sprites are fetched on demand from their original public `assets.petdex.dev` URLs. They are not replaced with reduced artwork or a smaller character catalog. `check-cdn.mjs` verifies five representative images (community, curated, and static formats) against local bytes and the original manifest SHA-256; it also checks browser CORS. This is a sampled availability check, not a guarantee of future CDN uptime.

The game keeps browser-local saves, sound, camera, HUD and animal-deck preferences. Existing saves on `127.0.0.1:5242` do not migrate automatically to the hosted origin. No browser data or local save files are copied. Map/game messages retain exact origin and window-source checks; the hosted child accepts only a same-origin parent, and its return link uses the hosted map path.

The publication allowlist excludes QA captures, internal project handbooks, developer roadmap material, release records, configuration, local paths and test/build scripts. Public player controls, chapter descriptions, story guides, required fonts and original attribution files are retained. Build reports remain outside the site's `public` directory.

The integration preserves source attribution, including `REFERENCE-LICENSES.txt`, map/photo credits, font licenses, game source information and animal source URLs. There is no backend or live geographic API; the map uses its existing geographic snapshot. All output files are checked to stay below the 25 MiB hosting asset limit.

## Local responsiveness repair (2026-09-27)

The hosted atlas bundle is now pinned by SHA-256 in `runtime-baseline.js` and `runtime-baseline.sha256`. Reapply the reviewed repair with:

```powershell
node integration/chaoshan-atlas/patch-runtime.mjs
node integration/chaoshan-atlas/verify.mjs
npm run build
```

Do not run `build.mjs` as a routine refresh: it imports the separately maintained port-5242 project, whose source has newer unrelated changes, and replaces the integrated copy. Importing a new source version requires a new reviewed baseline and patch targets.

The repair yields between startup batches, respects configured actor budgets, groups overview instances into larger cells, and displays detailed exhibits/street activity when zoomed in. Overview shadow rendering is omitted; near-view shadows remain. Small partitioned surfaces retain their original complete mesh. All place entries, models, day/night controls, map layers and adventure assets are retained. Game progress and usage databases are untouched.

The parent waits for an explicit ready/error message, validates its origin and frame, provides cancellation/retry, and unmounts stalled initialization after 45 seconds without progress. The embedded renderer pauses offscreen and behind the game. Runtime state includes existing geometry stats and a read-only `renderGroups()` diagnostic.

The repair updates the integrated copy only. It does not modify the original port-5242 application.
