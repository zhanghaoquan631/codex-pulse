# Desktop animal catalog — complete local import, V18

All **1,593 entries** from the user's local `animal-trail/catalog/creatures.json` are now included. The first ten remain under their existing IDs and game names. The original eight desktop bundled sheets are byte-identical to the catalog copies. The notes below headed V17 describe the initial batch only.

## V18 source and animation preservation

Every ID folder includes the unchanged original `spritesheet.webp` and `pet.json`. 62 source sheets actually contain PNG data under a `.webp` name; their original bytes and names are both retained. The local collection includes animals, fantasy creatures and anthropomorphic characters; no entry was silently excluded. Original authors and URLs are recorded per animal. Source URLs are attribution, not runtime dependencies.

Each per-animal `manifest.json` contains actual dimensions, exact `frameRectsByRow`, alpha bounds, valid source frame indices and `sourceActions`. All **94,802 nonempty source cells** remain accessible; blank trailing cells are excluded. Creator action names and row mappings take priority over common layouts. Original multi-row action `sequence` arrays, custom frame rates and millisecond `durations` are retained.

Top-level `manifest.json`, `catalog-index.json` and `animal-catalog-data.mjs` are lightweight catalogs; details and full sprite sheets must load per animal. Never preload the full 3,016,712,654 original image bytes at startup.

Most sources use nine rows: idle, running-right, running-left, waving, jumping, failed, waiting, running/work and review. Creator-specific labels include eating, typing, spinning, elemental evolution, warming paws and more. **176 sheets have eleven rows**, including original directional looks; all extra rows are retained.

Special layouts are `yuze-studio` (9×8 cells of 192×208), `coco` (8×8 cells of 160×160), and `burger-cat` (9×8 over 1278×1231 pixels). Exact rounded pixel rectangles preserve the latter's uneven cell heights. `burger-cat` has a checkerboard baked into the source artwork and some `yuze-studio` frames include photographic backgrounds; originals are preserved, not silently repainted.

`clawd` and `pet-2` each contain one 1024×1024 still image. `codex-silver-kitten` contains a grid of pixel-identical frames. These three are accurately marked `sourceStatic:true`, while **1,590 entries have changing original frames**. All include `sourceDistinctFrameCount`. Game movement, leaning, weapon recoil and attack effects are adaptations, not newly drawn native animations.

All 1,593 source IDs remain in the collection. Byte-identical files and catalog-declared identical `visualKey` values are grouped into **1,571 visual identities**. `dedupeKey` identifies each visual group and `aliases` retains its original IDs. Random selection must use these groups to avoid repeating duplicate aliases. A finite collection begins another shuffled cycle after its unique identities have all been used.

The importer is `work/v18-assets-build.py`; `work/v18-assets-audit.json` records every original hash. `work/v18-assets-verify.py` independently rereads source and destination bytes, all action frames and alpha rectangles. The passing full-scope result is `work/v18-assets-verification.json`.

---

## V17 historical first-ten notes

These are the user's existing desktop pet sprites from the local Lively Wallpaper `animal-trail` library, reused as transparent animated characters. No replacement animal artwork was generated and no desktop source files were modified.

## Selection

| ID | In-game name | Visual source | Combat classification |
|---|---|---|---|
| byte-bunny | 奶油兔 | Desktop's original 8 | Visible arms: ranged weapon |
| silver-shorthair | 薄荷猫 | Desktop's original 8 | Quadruped: pounce |
| prompt-penguin | 冰川企鹅 | Desktop's original 8 | Bird: charge; no added human arms |
| fine-pup | 薰衣草小狗 | Desktop's original 8 | Quadruped: pounce |
| little-deer | 秋日小鹿 | Desktop's original 8 | Quadruped: charge |
| nightly-fox | 北极小狐狸 | Desktop's original 8 | Quadruped: pounce |
| cloudy | 云朵熊猫 | Desktop's original 8 | Visible arms: ranged weapon |
| peri-the-owl | 月光猫头鹰 | Desktop's original 8 | Bird: swoop; no added human arms |
| zichaoxiong | 自嘲熊 | Existing desktop catalog | Visible arms: ranged weapon |
| crabbo | 机械钳蟹 | Existing desktop catalog | Existing claws: close-range claw/charge |

The user's catalog currently contains 1,593 metadata records. This is the first playable group of ten, not a claim that all catalog records have been integrated. The last two are chosen for distinct silhouettes and combat roles.

## Original files and derived previews

Each animal folder contains the unchanged original `spritesheet.webp` and `pet.json`; `preview.png` is the first valid idle frame cropped from that exact sheet with its transparency retained. The public manifest includes each original sheet SHA-256 and catalog attribution/URLs when present in the local catalog. An exact-byte copy audit and frame analysis are kept under `work/v17-assets-audit.json` in the development workspace.

The desktop library's catalog is attributed to Petdex contributors recorded in the local source metadata. These files do not grant or imply additional rights beyond those of the original assets. Source URLs are provenance only; the game uses local files and does not depend on them at runtime.

## Animation contract

All selected sheets use 192 × 208 pixel cells and 8 columns. The first nine animals have 9 rows; `crabbo` has 11. A renderer must use the actual sheet height and each animation's `frames` list instead of blindly playing eight frames. Several source rows intentionally contain blank trailing cells.

The original desktop mapping labels rows 0 idle, 1 walk/run, 2 pounce/roll, 3 greeting, 4 look, 5 sleep, 6 happy idle, 7 jump, 8 special. Visual inspection shows row 2 often includes mirrored locomotion. The game therefore adapts these source gestures with its own movement, projectile/recoil or contact lunge; it must not describe them as newly drawn gunfire or dedicated hit-reaction sprite animations.

`manifest.json` provides `idle`, `walk`, `run`, `attack`, `jump`, `hurt`, `wave`, `sleep`, `happy`, and `look` frame recipes. `attack` uses the arm gesture row for armed animals and the pounce/locomotion row for unarmed animals. `hurt` uses an existing special pose, with game-level reaction applied separately. All of these recipes contain nonempty frames and more than one distinct image.
