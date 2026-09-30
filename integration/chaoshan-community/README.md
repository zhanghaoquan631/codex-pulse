# Community portal in the hosted Chaoshan atlas

The existing `#atlas` dashboard and `/local-apps/chaoshan-atlas/index.html` now open the community map. The local port-5242 original and port-5243 community project remain independent.

Includes the 2026-09-26 BetterOPC snapshot: 24 communities across 15 cities, original-source ranking positions and attribution, 439 policy/industry entries, two platform activities and 26 local photographs. The national map retains source coordinates (source CRS unspecified), OpenStreetMap tiles and the local Natural Earth land fallback. Favorites and custom places are browser-local; no user records or original browser saves are copied into publication.

The published responsive 3D runtime `assets/index-responsive-b78981934e80.js` remains byte-identical. `build.mjs` verifies its content hash, generates a separately named derivative with the bounded geographic marker bridge, and compiles the community UI. Existing startup yields, render budgets, visibility pause, 266 places, day/night controls and 1,593 adventure animal records remain. The 3D module loads only on request. Its return action remains available during initialization, and a failed module import returns to the community portal.

Rebuild from this directory with `npm ci`, then `node build.mjs`. The original integration's `patch-runtime.mjs` or `build.mjs` must not overwrite the combined entry without rebuilding this integration afterwards. Any new responsive baseline needs an explicit hash/symbol review in this builder. Generated static outputs are committed so publishing does not require importing separately maintained local projects.

The same-origin parent waits for `pulse-community-status`; only this iframe's message is accepted. Existing visibility and adventure message validation remain unchanged. No data schemas, authentication policies, application secrets or dashboard records changed.

Validation: existing asset verifier (25 MiB maximum, local URL references, all 1,593 animal manifests), desktop/mobile browser flows, community search, both ranking boards, policies, refresh persistence, custom 3D coordinates/markers and paused scene clock behind the portal. See `verification.json` and the original atlas integration reports. Sources and snapshot limitations are in `SOURCES.md`.
