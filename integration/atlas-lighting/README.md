# Lighting sync, 2026-09-27

This release ports the current local atlas lighting modules into the existing hosted community map. It does not replace the dashboard, community portal, custom-place storage, adventure files, content database, or authentication configuration.

`source/` contains the reviewed local sky, solar clock, scene tools, styles, and reference HTML. The existing hosted runtime is pinned by SHA-256. The builder changes only its lighting/time integration and pause timing, retaining its cooperative startup, population limits, visibility suspension, detail LOD and community bridge. `host-adapter.js` supplies continuous lighting to the existing scene objects. Three.js and icon code are bundled, and the two existing Poly Haven HDR files are served locally under the site's map path.

Features: four periods, 12-second manual transitions, an illustrative 24-minute automatic cycle, photographic sun/clouds, procedural stars/moon, tree/building shadows, three quality modes, simulation pause, opt-in synthesized ambient sound, PNG export, and clean-view controls. This is visual simulation, not live weather or astronomical ephemeris data.

Rebuild here with `npm ci` and `node build.mjs`. After rebuilding the older community integration, run this builder again so the final HTML selects the lighting runtime. Keep the pinned community asset unchanged. The generated assets are committed for the standard Site build; no separately maintained localhost project is needed during production deployment.

Browser regression: `node verify-browser.mjs <directory-containing-playwright-and-pngjs>` starts and closes its own local static server. Artifacts are stored in the ignored project `work/atlas-lighting-qa` directory. The generated `verification.json` records the results.
