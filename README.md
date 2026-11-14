# Raton Z

An isometric 3D survival roguelike built with Three.js, React, TypeScript and Vite. Spanish interface, original procedural low-poly scenery, and no external game assets or backend required.

Official repository: https://github.com/CoipoNorte/Raton-Z

## Local Development

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

## Controls

| Action               | Keyboard      | Touch          | Standard Gamepad                  |
| -------------------- | ------------- | -------------- | --------------------------------- |
| Move                 | WASD / arrows | Left joystick  | Left stick / D-pad                |
| Shoot / Steady walk  | Hold Space    | Hold A         | Hold A / RT                       |
| Reload magazine      | R             | Tap weapon HUD | Y                                 |
| Knife push (15s)     | F             | Knife button   | RB                                |
| Interact             | E             | B              | B                                 |
| Switch weapon        | Q             | Circular arrow | X                                 |
| Dodge                | Shift         | Dodge button   | LB                                |
| Pause                | Esc / P       | Top pause icon | Start                             |
| Restart after defeat | R / Enter     | Restart button | Select restart with touch/pointer |

Auto-fire starts enabled and can be disabled in settings. Hold interact to clear debris; progress is retained. Recruit up to two rabbits by their candles. Spend run gold at the central fire. Defeated enemies drop gold, temporary shotgun ammunition, and medical kits. The fire's immediate radius is safe. Passing through doors streams a logical 3x3 room grid; rooms left three transitions behind collapse and regenerate. Five biomes feature offices, L-shaped streets, prison cells, library shelves, and organic growth.

## Weapons and Aim Range

Auto-aim is deliberately short so danger stays close. A "character" is 0.85 world units: the pistol and shotgun reach 5 characters (4.25 units), the SMG also 5, and rifles reach 7 (5.95 units). This is about one third of the original 12.5-unit auto-aim bubble.

| Weapon  | Magazine | Reserve       | Range   | Behaviour                             |
| ------- | -------- | ------------- | ------- | ------------------------------------- |
| Pistol  | 9        | Infinite (∞)  | 5 chars | Reliable sidearm, snappy reload       |
| Shotgun | 6        | Found pickups | 5 chars | Three pellets, heavy knockback        |
| Rifle   | 29       | Found pickups | 7 chars | Tactical carbine, longest reach       |
| SMG     | 24       | Found pickups | 5 chars | Suppressed rapid fire, compact recoil |

Standing still grants **90% accuracy**, while running freely drops accuracy to **75%**. Holding manual fire (`Space` / `A` / `RT`) locks the survivor into a steady aiming walk—preserving **90% accuracy** at reduced movement speed. Pressing `F` (or the touch knife button / `RB`) unleashes a close-quarters knife slash every **15 seconds** that shoves nearby mutants back.

Ammunition crates carry a random secondary weapon. Picking one up adds it to the arsenal (up to four times its pickup ammo) and equips it. `Q` or the gamepad `X` button cycles pistol → shotgun → rifle → SMG, skipping empty weapons. When a secondary runs dry the survivor automatically returns to the infinite pistol. Companion shots use the short pistol range.

## Horde Pressure (Vampire-Survivors style)

Mutants spawn on the border of the actual camera frustum, projected onto the ground plane, so they always walk in from off-screen and reach the player from unseen directions. When the loaded rooms are smaller than the view, the spawn falls back to the farthest loaded corner. Pressure ramps slowly and consistently: the horde budget grows from 9 to 44 survivors (30 on mobile) and the spawn rate eases from 0.5 to 0.14 per second. Toughness scales gradually with elapsed time. An elite mutant storms the arena every 26 seconds and then every 38–54 seconds.

Staying in the same biome raises the horde's interest: spawn rate and population budget grow with a per-biome dwell timer (up to ×2.6 pressure). Crossing into a different biome resets that pressure to normal, so moving between arenas is both a risk and a way to breathe. The HUD shows `AMENAZA ×n` while pressure is above normal.

Debris can be cleared from a generous halo: the interaction radius is measured from the pile's edge plus 2.2 world units, so survivors no longer need pixel-perfect positioning.

Medical kits are deliberately scarce: at most two exist at once, with a nine-second cooldown between drops. The fire shop sells twelve one-time run upgrades with elevated costs, compelling tactical choices.

## Military Supply Crates

Occasionally (28% chance per procedural non-refuge room), reinforced military supply containers with pulsing beacon lights spawn in corners. Survivors can breach them by pressing `E` or striking them with the combat knife (`F`). Crates grant one of five game-changing rewards:

- **Massive Ammo Cache:** tops off all magazines and adds large reserve ammunition across secondaries.
- **Campaign Gold Bounty:** awards +110 to +180 gold for the fire shop.
- **Anima Relic:** triggers an immediate Level Up with Instinct Perk Draft.
- **Harvest of Embers:** awards +3 to +5 permanent Brasas directly to the menu profile.
- **Tactical Barrier & Surgery:** restores 100% health and grants a 30-second Tactical Shield (absorbs 60% of all incoming damage).

## Set Dressing Rules

Every procedural room receives biome-specific set dressing: office desks with monitors, chairs, filing cabinets, water coolers and staff lockers; street cones, dumpsters, hydrants, benches, signage and manholes; prison bunks, toilets, sinks, concrete tables, footlockers and cage shelves; library book piles, reading tables, card catalogues, step stools, fallen shelves and globes; and garden mushroom clusters, bones, stone rings, mutant pods, fallen logs and glowing flowers. The refuge only receives camp props (bedroll, lantern crate, sandbags).

Placement respects hard rules: props never spawn inside the fire, the survivor's candelabrum, the door lanes, the biome's own furniture or a supply crate, and they keep a minimum distance from each other. Decoration is non-blocking on purpose, because rooms collapse and regenerate constantly and a blocking prop could trap the survivor.

Two automated audits run whenever a room is generated and are exposed as `data-decor-*` attributes:

- **Grounding:** a prop must rest on the floor; it may not hover (`data-decor-floating`) or sink through the slab (`data-decor-sunk`).
- **Support connectivity:** each individual part must touch or rest on another part that is itself connected to something on the floor, so nothing is left hanging in mid-air (`data-decor-unsupported`).

`data-min-rig-y` records the lowest torso height reached, which proves the dodge roll never pushes the survivor under the floor.

AI model authorship is tracked sequentially in `NombreIA.md`. Each contributing model must state its exact model name at the start of its response and append a new row instead of overwriting history.

## Persistence

IndexedDB stores the top ten local runs, lifetime totals, earned embers, and permanent upgrades. localStorage is a fallback and stores audio/control preferences. No personal data is sent to a server. Clearing site data resets progress. Private browsing may restrict storage.

## Production

```sh
npx tsc --noEmit
npm run build
npm run preview
```

The renderer uses shared character templates, vertex-color batched static geometry, instanced floors and particles, capped and adaptive device pixel ratio, bounded enemies, visibility culling, and a fixed maximum of nine loaded rooms. The performance setting disables shadows and lowers resolution. Fixed simulation substeps keep collisions consistent; hidden tabs pause automatically. Fonts are bundled locally. Actual frame rate depends on the device and browser.

## Browser Tests

```sh
npx playwright install --with-deps chromium
npx playwright test
```

The suite covers character selection, controls and preferences, combat, pause/resume, fire upgrades, recruiting, procedural doors, retained debris progress, game over, instant restart, IndexedDB records, permanent upgrades, and touch input. Tests initialize the real Three.js scene but skip repeated GPU draws so the simulation can run reliably on CPU-only CI. Visual rendering should additionally be checked in a real GPU-accelerated desktop and mobile browser. Renderer diagnostics are available as data attributes on the `.world` element.

## GitHub Pages

1. Push the project into the official repository on `main` or `master`.
2. In **Settings > Pages**, select **GitHub Actions** as the source.
3. The included `.github/workflows/deploy.yml` installs locked dependencies, checks TypeScript, runs the gameplay browser tests, builds with `--base /Raton-Z/`, and publishes `dist` using GitHub Pages artifacts.
4. On Windows, run `deploy.bat` to validate, build, confirm the commit, and push. Git authentication must already be configured. The script never force-pushes.

Expected URL: https://coiponorte.github.io/Raton-Z/

For a different repository name or custom domain, change the CLI base in the deployment workflow and Windows script. Never commit secrets, `node_modules`, or `dist`; `.gitignore` covers these files.
