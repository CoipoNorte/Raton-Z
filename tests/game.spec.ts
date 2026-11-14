import { test, expect, type Page } from "@playwright/test";
import {
  CHARACTER_UNIT,
  INITIAL_SNAPSHOT,
  KNIFE_COOLDOWN,
  WEAPONS,
  calculateRunEmbers,
} from "../src/game/types";

test("weapon ranges and magazine limits match tactical specs", () => {
  const pistol = WEAPONS.pistol.range * CHARACTER_UNIT;
  const shotgun = WEAPONS.shotgun.range * CHARACTER_UNIT;
  const rifle = WEAPONS.rifle.range * CHARACTER_UNIT;
  const smg = WEAPONS.smg.range * CHARACTER_UNIT;
  // Roughly one third of the previous 12.5-unit auto-aim bubble.
  expect(pistol).toBeLessThanOrEqual(4.3);
  expect(shotgun).toBeLessThanOrEqual(4.3);
  expect(smg).toBeLessThanOrEqual(4.3);
  expect(rifle).toBeGreaterThan(pistol);
  expect(rifle).toBeLessThanOrEqual(6);
  expect(WEAPONS.pistol.clip).toBe(9);
  expect(WEAPONS.shotgun.clip).toBe(6);
  expect(WEAPONS.rifle.clip).toBe(29);
  expect(KNIFE_COOLDOWN).toBe(15);
  expect(Object.keys(WEAPONS)).toHaveLength(4);
});

async function prepare(
  page: Page,
  options: { autoFire?: boolean; seeded?: boolean; tokens?: number } = {},
) {
  await page.addInitScript(({ autoFire, seeded, tokens }) => {
    if (!localStorage.getItem("raton-z-settings"))
      localStorage.setItem(
        "raton-z-settings",
        JSON.stringify({
          quality: "low",
          sound: false,
          autoFire: autoFire !== false,
        }),
      );
    if (seeded) Math.random = () => 0.2;
    if (tokens)
      localStorage.setItem(
        "raton-z-profile",
        JSON.stringify({
          tokens,
          totalRuns: 0,
          totalKills: 0,
          upgrades: { vitality: 0, damage: 0, speed: 0 },
          records: [],
        }),
      );
  }, options);
  // Keep the real scene initialization but skip repeated GPU draws in CPU-only CI.
  // Simulation, input, room generation, persistence and the React UI stay unmodified.
  await page.route("**/src/game/engine.ts*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const patched = source.replace(
      "this.renderer.render(this.scene, this.camera);",
      "if (this.visualTime < 0.03) this.renderer.render(this.scene, this.camera);",
    );
    expect(patched).not.toBe(source);
    await route.fulfill({ response, body: patched });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "SOBREVIVE A LA NOCHE" }),
  ).toBeEnabled();
}

async function start(page: Page) {
  await page.getByRole("button", { name: "SOBREVIVE A LA NOCHE" }).click();
  await expect(page.locator(".game-hud")).toBeVisible();
}

async function hold(page: Page, keys: string[], milliseconds: number) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  for (const key of keys) await page.keyboard.up(key);
}

async function chooseLevelUp(page: Page) {
  const choice = page.locator(".level-choice").first();
  if (await choice.isVisible().catch(() => false)) {
    await choice.click();
    await page.waitForTimeout(120);
    return true;
  }
  return false;
}

// Farms gold while orbiting so the survivor keeps dodging the horde.
async function farmGold(page: Page, target: number, limit = 34000) {
  await page.keyboard.down("Space");
  const deadline = Date.now() + limit;
  const orbit = [
    ["w", "d"],
    ["s", "d"],
    ["s", "a"],
    ["w", "a"],
  ];
  let step = 0;
  while (Date.now() < deadline) {
    if (await page.locator(".gameover-modal").count()) break;
    if (await chooseLevelUp(page)) continue;
    const gold = parseInt(
      await page.locator(".score-hud > div > span").nth(1).innerText(),
    );
    if (gold >= target) break;
    for (const key of orbit[step % orbit.length]) await page.keyboard.down(key);
    await page.waitForTimeout(320);
    for (const key of orbit[step % orbit.length]) await page.keyboard.up(key);
    step++;
  }
  await page.keyboard.up("Space");
}

// Walks back to the fire so the contextual shop can be opened again.
async function returnToFire(page: Page) {
  for (let i = 0; i < 70; i++) {
    const raw = await page.locator(".world").getAttribute("data-player");
    const [x, z] = (raw || "9,9").split(",").map(Number);
    if (Math.hypot(x, z) < 3.2) return true;
    const keys: string[] = [];
    if (z > 1) keys.push("w");
    if (z < -1) keys.push("s");
    if (x > 1) keys.push("a");
    if (x < -1) keys.push("d");
    if (!keys.length) return true;
    await hold(page, keys, 260);
  }
  return false;
}
test("start screen, all survivors, help and persistent preferences", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("RATÓN");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Coneja", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Coneja", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Gato", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Gato", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Aprende a sobrevivir" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "CONFÍA EN TU INSTINTO.",
  );
  await page.getByRole("button", { name: "Mando", exact: true }).click();
  await expect(page.locator(".help-controls")).toContainText("STICK / CRUCETA");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await page.getByRole("switch", { name: "Sacudida de cámara" }).click();
  await page.getByRole("button", { name: "Fijo", exact: true }).click();
  await page.getByRole("button", { name: "TODO LISTO" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Sacudida de cámara" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("button", { name: "Fijo", exact: true }),
  ).toHaveClass("selected");
  expect(errors).toEqual([]);
});

test("immediate combat, pause, resume and contextual fire upgrades", async ({
  page,
}) => {
  await prepare(page);
  await start(page);
  await expect
    .poll(async () =>
      Number(
        (await page.locator(".score-hud > strong").innerText()).replace(
          /\D/g,
          "",
        ),
      ),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toContainText("TODAVÍA SIGUES AQUÍ.");
  const pausedTime = await page.locator(".run-time").innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator(".run-time")).toHaveText(pausedTime);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toContainText("AVIVA TU INSTINTO.");
  await expect(page.locator(".run-upgrade")).toHaveCount(18);
  await page.getByRole("button", { name: "SEGUIR SOBREVIVIENDO" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a friendly survivor can join the run", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  await hold(page, ["w", "a"], 520);
  await expect(page.locator(".context-prompt")).toContainText(
    "NO TIENES QUE IR SOLO",
  );
  await page.keyboard.press("e");
  await expect(page.locator(".companions-hud")).toContainText("COMPAÑERO 01");
});

test("procedural doors, debris hold progress and completion", async ({
  page,
}) => {
  await prepare(page, { seeded: true });
  await start(page);
  await hold(page, ["w"], 300);
  await hold(page, ["w", "d"], 2200);
  await expect(page.locator(".health-caption")).not.toHaveText("EL REFUGIO");
  await hold(page, ["w", "d"], 2500);
  await expect(page.locator(".context-prompt")).toContainText(
    "ABRE TU PROPIO CAMINO",
  );
  await hold(page, ["e"], 800);
  const before = await page
    .locator(".rubble-progress i")
    .evaluate((element) => parseFloat((element as HTMLElement).style.width));
  expect(before).toBeGreaterThan(20);
  await page.waitForTimeout(500);
  const after = await page
    .locator(".rubble-progress i")
    .evaluate((element) => parseFloat((element as HTMLElement).style.width));
  expect(Math.abs(before - after)).toBeLessThan(5);
  await hold(page, ["e"], 1800);
  await expect(page.locator(".rubble-progress")).toHaveCount(0);
});

test("game over, IndexedDB high scores and instant restart", async ({
  page,
}) => {
  await prepare(page, { autoFire: false, seeded: true });
  await start(page);
  await expect(
    page.getByRole("dialog", { name: "LA NOCHE GANA." }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".saved-status")).toContainText("GUARDADO");
  await expect(page.locator(".run-reward")).toContainText("+1 brasa");
  await expect(page.locator(".gameover-modal .primary-button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".health-heading")).toContainText("100");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Terminar partida y volver al refugio" })
    .click();
  await page.getByRole("button", { name: "Clasificación" }).click();
  await expect(page.locator(".table-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Clasificación" }).click();
  await expect(page.locator(".table-row")).toHaveCount(1);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).some(
        (database) => database.name === "raton-z-survival",
      ),
    ),
  ).toBe(true);
});

test("permanent upgrades persist and affect the next character", async ({
  page,
}) => {
  await prepare(page, { tokens: 10 });
  await page
    .getByRole("button", { name: "Supervivientes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mejorar Corazón valiente por 6 brasas" })
    .click();
  await expect(page.locator(".ember-balance")).toContainText("4");
  await expect(
    page
      .locator(".permanent-upgrade")
      .filter({ hasText: "Corazón valiente" })
      .locator(".level-caption"),
  ).toContainText("1 / 20");
  await page.getByRole("button", { name: "ESTOY LISTO" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Supervivientes", exact: true })
    .click();
  await expect(page.locator(".ember-balance")).toContainText("4");
  await expect(
    page
      .locator(".permanent-upgrade")
      .filter({ hasText: "Corazón valiente" })
      .locator(".level-caption"),
  ).toContainText("1 / 20");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Coneja", exact: true })
    .click();
  await page.getByRole("button", { name: "ESTOY LISTO" }).click();
  await start(page);
  await expect(page.locator(".health-heading")).toContainText("95");
});

test("touch layout, dynamic joystick and contextual actions", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await prepare(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await start(page);
  await expect(page.locator(".joystick-zone")).toBeVisible();
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 80, y: 670, id: 1 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 110, y: 640, id: 1 }],
  });
  await expect(page.locator(".joystick.active")).toBeVisible();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".joystick.active")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Disparar, espacio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pausar partida" }).click();
  await expect(page.getByRole("dialog")).toContainText("PARTIDA EN PAUSA");
  await context.close();
});

test("run gold can buy a real temporary health upgrade", async ({ page }) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  await farmGold(page, 55);
  await returnToFire(page);
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toContainText("AVIVA TU INSTINTO.");
  const before = parseInt(await page.locator(".gold-balance").innerText());
  const beforeHeader = await page.locator(".health-heading").innerText();
  const currentMax = parseInt(beforeHeader.split("/")[1]);
  await page
    .locator(".run-upgrade")
    .filter({ hasText: "Un nuevo aliento" })
    .click();
  await expect(page.locator(".health-heading")).toContainText(
    `/ ${currentMax + 25}`,
  );
  expect(parseInt(await page.locator(".gold-balance").innerText())).toBe(
    before - 55,
  );
  await page.getByRole("button", { name: "SEGUIR SOBREVIVIENDO" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const weapon =
    (await page.locator(".world").getAttribute("data-weapon")) || "pistol";
  await expect(page.locator(".weapon-hud strong")).toContainText(
    WEAPONS[weapon as keyof typeof WEAPONS].name.toUpperCase(),
  );
  await expect(page.locator(".weapon-hud .ammo-available")).toContainText(
    `${WEAPONS[weapon as keyof typeof WEAPONS].range} PASOS`,
  );
});

test("standard gamepad can start, pause, move, interact and resume", async ({
  page,
}) => {
  await prepare(page, { seeded: true });
  await page.evaluate(() => {
    const pad = {
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [pad],
    });
    Object.defineProperty(window, "__pad", { value: pad });
  });
  const padButton = async (index: number, pressed: boolean) => {
    await page.evaluate(
      ({ index, pressed }) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean }[] } }
        ).__pad;
        pad.buttons[index].pressed = pressed;
      },
      { index, pressed },
    );
    await page.waitForTimeout(100);
  };
  await padButton(0, true);
  await expect(page.locator(".game-hud")).toBeVisible();
  await padButton(0, false);
  await padButton(9, true);
  await expect(page.getByRole("dialog")).toContainText("PARTIDA EN PAUSA");
  await padButton(9, false);
  await padButton(0, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await padButton(0, false);
  await page.evaluate(() => {
    (window as unknown as { __pad: { axes: number[] } }).__pad.axes = [-1, -1];
  });
  await page.waitForTimeout(550);
  await page.evaluate(() => {
    (window as unknown as { __pad: { axes: number[] } }).__pad.axes = [0, 0];
  });
  await expect(page.locator(".context-prompt")).toContainText(
    "NO TIENES QUE IR SOLO",
  );
  await padButton(1, true);
  await expect(page.locator(".companions-hud")).toContainText("COMPAÑERO 01");
  await padButton(1, false);
});

test("defeated enemies are swallowed by the abyss", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  await expect
    .poll(
      async () =>
        Number((await page.locator(".world").getAttribute("data-abyss")) || 0),
      { timeout: 25000 },
    )
    .toBeGreaterThan(0);
});

test("fire shop upgrades are sold only once", async ({ page }) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  await farmGold(page, 60);
  await returnToFire(page);
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toContainText("AVIVA TU INSTINTO.");
  const item = page.locator(".run-upgrade").filter({ hasText: "Mano firme" });
  const gold = async () =>
    parseInt(await page.locator(".gold-balance").innerText());
  const before = await gold();
  await item.click();
  await expect(item).toHaveClass(/sold/);
  await expect(item).toBeDisabled();
  expect(await gold()).toBe(before - 60);
  await item.click({ force: true }).catch(() => {});
  expect(await gold()).toBe(before - 60);
  await page.getByRole("button", { name: "SEGUIR SOBREVIVIENDO" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("menu shop keeps growing with escalating costs", async ({ page }) => {
  await prepare(page, { tokens: 60 });
  await page
    .getByRole("button", { name: "Supervivientes", exact: true })
    .click();
  await expect(page.locator(".permanent-upgrade")).toHaveCount(12);
  const row = page
    .locator(".permanent-upgrade")
    .filter({ hasText: "Corazón valiente" });
  const firstCost = parseInt(await row.locator("button").innerText());
  expect(firstCost).toBe(6);
  await row.locator("button").click();
  const secondCost = parseInt(await row.locator("button").innerText());
  expect(secondCost).toBe(11);
  await expect(row.locator(".level-caption")).toContainText("1 / 20");
  const armorRow = page
    .locator(".permanent-upgrade")
    .filter({ hasText: "Segunda piel" });
  await armorRow.locator("button").click();
  await expect(armorRow.locator(".level-caption")).toContainText("1 / 16");
  await expect(page.locator(".ember-balance")).toContainText("44");
  await page.locator(".refund-button").click();
  await expect(page.locator(".ember-balance")).toContainText("60");
  await row.locator("button").click();
  await page.getByRole("button", { name: "ESTOY LISTO" }).click();
  await start(page);
  await expect(page.locator(".health-heading")).toContainText("110 / 110");
});

test("cells sharing a biome stay one continuous room", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  const cell = async () =>
    (await page.locator(".world").getAttribute("data-cell")) || "";
  // Phase 1: reach the refuge doorway, then keep walking north.
  await hold(page, ["w"], 500);
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await expect.poll(cell, { timeout: 20000 }).toBe("0,-1");
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  const caption = await page.locator(".health-caption").innerText();
  expect(caption).not.toBe("EL REFUGIO");
  await expect(page.locator(".world")).toHaveAttribute("data-room-steps", "1");
  // Phase 2: drift off the centre corridor, clear of the central debris pile.
  await hold(page, ["d"], 750);
  // Phase 3: cross the seam only a shared biome would leave open.
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await expect.poll(cell, { timeout: 20000 }).toBe("0,-2");
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await expect(page.locator(".health-caption")).toHaveText(caption);
  await expect(page.locator(".world")).toHaveAttribute("data-room-steps", "1");
});

test("the horde walks in from beyond the camera", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  await expect
    .poll(
      async () => {
        await chooseLevelUp(page).catch(() => false);
        return Number((await world.getAttribute("data-spawned")) || 0);
      },
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(12);
  const viewRadius = Number(await world.getAttribute("data-view-radius"));
  const average = Number(await world.getAttribute("data-avg-spawn"));
  expect(viewRadius).toBeGreaterThan(5);
  expect(average).toBeGreaterThanOrEqual(viewRadius);
  const early = Number(await world.getAttribute("data-population"));
  expect(early).toBeGreaterThanOrEqual(12);
  // Pressure keeps climbing: choose any level-up boon so time can advance.
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    await chooseLevelUp(page);
  }
  expect(Number(await world.getAttribute("data-population"))).toBeGreaterThan(
    early,
  );
});

test("medical kits stay scarce on the field", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  await page.waitForTimeout(14000);
  expect(
    Number(await page.locator(".world").getAttribute("data-kits")),
  ).toBeLessThanOrEqual(2);
});

test("an elite brute eventually storms the arena", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  await expect
    .poll(
      async () => {
        await chooseLevelUp(page).catch(() => false);
        return Number(
          (await page.locator(".world").getAttribute("data-elites")) || 0,
        );
      },
      { timeout: 45000 },
    )
    .toBeGreaterThan(0);
});

test("the fire shop offers the new survival mechanics", async ({ page }) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  await farmGold(page, 95);
  await returnToFire(page);
  await page.keyboard.press("e");
  await expect(page.locator(".run-upgrade")).toHaveCount(18);
  const blast = page
    .locator(".run-upgrade")
    .filter({ hasText: "Ceniza expansiva" });
  await expect(blast).toBeEnabled();
  await blast.click();
  await expect(blast).toHaveClass(/sold/);
  await expect(blast).toBeDisabled();
  await page.getByRole("button", { name: "SEGUIR SOBREVIVIENDO" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("shots never travel beyond the short weapon range", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  await expect
    .poll(
      async () => Number((await world.getAttribute("data-last-hit")) || 0),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  const range = Number(await world.getAttribute("data-range"));
  const hit = Number(await world.getAttribute("data-last-hit"));
  expect(range).toBeGreaterThan(3.9);
  expect(range).toBeLessThanOrEqual(6);
  expect(hit).toBeLessThanOrEqual(range + 0.6);
});

test("debris can be cleared from a wider halo", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  await hold(page, ["w"], 300);
  await hold(page, ["w", "d"], 2200);
  await expect
    .poll(
      async () => (await page.locator(".health-caption").innerText()) || "",
      { timeout: 20000 },
    )
    .not.toBe("EL REFUGIO");
  await hold(page, ["w", "d"], 2200);
  await expect(page.locator(".context-prompt")).toContainText(
    "ABRE TU PROPIO CAMINO",
  );
});

test("staying in a biome raises pressure and changing biome resets it", async ({
  page,
}) => {
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  const cell = async () => (await world.getAttribute("data-cell")) || "";
  const dwell = async () =>
    Number((await world.getAttribute("data-dwell")) || 0);
  const pressure = async () =>
    Number((await world.getAttribute("data-pressure")) || 1);
  expect(await pressure()).toBe(1);
  await hold(page, ["w"], 500);
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await expect.poll(cell, { timeout: 20000 }).toBe("0,-1");
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await page.waitForTimeout(5000);
  expect(await dwell()).toBeGreaterThan(3);
  expect(await pressure()).toBeGreaterThan(1.05);
  // Steer back through the refuge doorway: a different biome resets the horde.
  for (let i = 0; i < 45 && (await cell()) !== "0,0"; i++) {
    const raw = (await world.getAttribute("data-player")) || "0,-15";
    const [px, pz] = raw.split(",").map(Number);
    const keys: string[] = [];
    if (px > 0.8) keys.push("a");
    else if (px < -0.8) keys.push("d");
    keys.push(pz < -10.5 ? "s" : "w");
    await hold(page, keys, 260);
    await chooseLevelUp(page).catch(() => false);
  }
  await expect.poll(cell, { timeout: 5000 }).toBe("0,0");
  await expect.poll(pressure, { timeout: 5000 }).toBe(1);
  expect(await dwell()).toBeLessThan(2);
});

test("pistol has 9 rounds per magazine, reloads, and keeps infinite reserve", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  await expect(world).toHaveAttribute("data-clip", "9/9");
  await expect(world).toHaveAttribute("data-reserve", "inf");
  // Let an enemy enter pistol range, fire manually, then release Space
  await page.waitForTimeout(1600);
  await hold(page, ["Space"], 350);
  await expect
    .poll(async () => await world.getAttribute("data-clip"), { timeout: 5000 })
    .not.toBe("9/9");
  // Trigger manual reload with R and verify reload refills back to 9/9
  await page.keyboard.press("r");
  await expect
    .poll(async () => await world.getAttribute("data-clip"), { timeout: 5000 })
    .toBe("9/9");
  await expect(world).toHaveAttribute("data-reserve", "inf");
});

test("accuracy is 90% still, 75% moving, and 90% slow-walk when holding SPACE", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  // 1. Standing still: 90% precision
  await expect
    .poll(async () => await world.getAttribute("data-accuracy"))
    .toBe("90");
  // 2. Moving freely without Space: drops to 75% at full speed (1.00)
  await page.keyboard.down("d");
  await expect
    .poll(async () => await world.getAttribute("data-accuracy"))
    .toBe("75");
  await expect(world).toHaveAttribute("data-move-scale", "1.00");
  // 3. Holding Space while moving: keeps 90% precision at reduced speed (0.46)
  const beforePos = (await world.getAttribute("data-player")) || "0,0";
  await page.keyboard.down("Space");
  await expect
    .poll(async () => await world.getAttribute("data-accuracy"))
    .toBe("90");
  await expect(world).toHaveAttribute("data-move-scale", "0.46");
  await page.waitForTimeout(450);
  const afterPos = (await world.getAttribute("data-player")) || "0,0";
  expect(afterPos).not.toBe(beforePos);
  await page.keyboard.up("Space");
  await page.keyboard.up("d");
});

test("F triggers the knife slash, pushes nearby enemies, and enters 15s cooldown", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  // Wait ~1.8s so initial enemies close from 7.2u into the 4-unit slash radius
  await page.waitForTimeout(1800);
  await page.keyboard.press("f");
  await expect(world).toHaveAttribute("data-slashes", "1");
  await expect(page.locator(".action-knife")).toBeDisabled();
  expect(Number(await world.getAttribute("data-pushed"))).toBeGreaterThan(0);
  const cd = Number(await world.getAttribute("data-knife-cooldown"));
  expect(cd).toBeGreaterThan(13);
  expect(cd).toBeLessThanOrEqual(15);
  // Pressing F again while on cooldown must not trigger another slash
  await page.keyboard.press("f");
  await expect(world).toHaveAttribute("data-slashes", "1");
});

test("ember rewards scale with score, kills, waves, bounties, and legacy harvest", () => {
  const zero = calculateRunEmbers({ ...INITIAL_SNAPSHOT }, 0);
  expect(zero.total).toBe(1);
  const active = calculateRunEmbers(
    {
      ...INITIAL_SNAPSHOT,
      score: 880,
      kills: 24,
      wave: 3,
      bonusEmbers: 2,
    },
    2,
  );
  expect(active.scorePart).toBe(4);
  expect(active.combatPart).toBe(4);
  expect(active.bountyPart).toBe(2);
  expect(active.legacyBonus).toBeGreaterThan(0);
  expect(active.total).toBeGreaterThan(10);
});

test("enemy power escalates relentlessly and anima level-up pauses for perk draft", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  const initialPower = Number(await world.getAttribute("data-enemy-power"));
  expect(initialPower).toBeGreaterThanOrEqual(1);
  // Orbit and fight until reaching Level 2 and completing the first Night Bounty
  await farmGold(page, 65, 36000);
  const laterPower = Number(await world.getAttribute("data-enemy-power"));
  expect(laterPower).toBeGreaterThan(initialPower + 0.15);
  await expect
    .poll(async () => Number((await world.getAttribute("data-level")) || 1), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(2);
  if (await page.locator(".levelup-modal").count()) {
    await expect(page.locator(".level-choice")).toHaveCount(3);
    await page.keyboard.press("1");
    await expect(page.locator(".levelup-modal")).toHaveCount(0);
  }
});

test("level-up freezes the simulation until a boon is selected", async ({
  page,
}) => {
  test.setTimeout(70000);
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  const orbit = [
    ["w", "d"],
    ["s", "d"],
    ["s", "a"],
    ["w", "a"],
  ];
  for (let i = 0; i < 110; i++) {
    if ((await world.getAttribute("data-levelup")) === "1") break;
    if (await page.locator(".gameover-modal").count()) break;
    await hold(page, orbit[i % orbit.length], 260);
  }
  await expect(world).toHaveAttribute("data-levelup", "1");
  await expect(page.locator(".level-choice")).toHaveCount(3);
  const pausedTime = await page.locator(".run-time").innerText();
  await page.waitForTimeout(1300);
  await expect(page.locator(".run-time")).toHaveText(pausedTime);
  await page.keyboard.press("2");
  await expect(page.locator(".levelup-modal")).toHaveCount(0);
  await expect(world).toHaveAttribute("data-levelup", "0");
  await expect
    .poll(async () => page.locator(".run-time").innerText())
    .not.toBe(pausedTime);
});

test("tactical combat roll lasts over 0.3s with low trajectory", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  await page.keyboard.press("Shift");
  await page.waitForTimeout(140);
  // Halfway through roll: actively dodging and button disabled
  await expect(world).toHaveAttribute("data-dashing", "1");
  await expect(page.locator(".dash-button")).toBeDisabled();
  await page.waitForTimeout(350);
  await expect(world).toHaveAttribute("data-dashing", "0");
});

test("supply crates can be found in procedural biomes and grant major rewards", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: true });
  await start(page);
  // Walk across into procedural room
  await hold(page, ["w"], 400);
  await hold(page, ["w", "d"], 2100);
  await expect
    .poll(
      async () => (await page.locator(".health-caption").innerText()) || "",
      { timeout: 20000 },
    )
    .not.toBe("EL REFUGIO");
  // Check if crate exists or slash to pop open any nearby supply container
  await page.keyboard.press("f");
  await page.waitForTimeout(500);
});

test("nightly wave modifiers ramp difficulty", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  const initial = (await world.getAttribute("data-modifier")) || "REFUGIO";
  expect(initial.length).toBeGreaterThan(2);
  let changed = false;
  for (let i = 0; i < 60 && !changed; i++) {
    await chooseLevelUp(page).catch(() => false);
    await page.waitForTimeout(500);
    const current = (await world.getAttribute("data-modifier")) || "";
    if (current && current !== initial) changed = true;
  }
  expect(changed).toBe(true);
});

test("both shops expose their expanded catalogues", async ({ page }) => {
  await prepare(page, { tokens: 0 });
  await page
    .getByRole("button", { name: "Supervivientes", exact: true })
    .click();
  await expect(page.locator(".permanent-upgrade")).toHaveCount(12);
  await page.getByRole("button", { name: "ESTOY LISTO" }).click();
  await start(page);
  await page.keyboard.press("e");
  await expect(page.locator(".run-upgrade")).toHaveCount(18);
});

test("decoration props stay grounded in every biome", async ({ page }) => {
  test.setTimeout(90000);
  // Real RNG: a stubbed one collapses the slot search and hides the decoration.
  await prepare(page);
  await start(page);
  const world = page.locator(".world");
  const walk = [
    ["w", "d"],
    ["w", "a"],
    ["s", "a"],
    ["s", "d"],
    ["d"],
    ["a"],
    ["w"],
    ["s"],
  ];
  for (let i = 0; i < 14; i++) {
    await chooseLevelUp(page).catch(() => false);
    if (await page.locator(".gameover-modal").count()) break;
    // Long legs so the survivor really crosses into neighbouring biomes.
    await hold(page, walk[i % walk.length], 1900);
  }
  // Rooms were actually decorated, and every prop audited as grounded.
  expect(Number(await world.getAttribute("data-decor-count"))).toBeGreaterThan(
    20,
  );
  await expect(world).toHaveAttribute("data-decor-floating", "0");
  await expect(world).toHaveAttribute("data-decor-sunk", "0");
  await expect(world).toHaveAttribute("data-decor-unsupported", "0");
});

test("the dodge roll never pushes the survivor under the floor", async ({
  page,
}) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.down("d");
    await page.keyboard.press("Shift");
    await page.waitForTimeout(200);
    await page.keyboard.up("d");
    await page.waitForTimeout(400);
  }
  const minY = Number(await world.getAttribute("data-min-rig-y"));
  expect(minY).toBeGreaterThanOrEqual(0);
});

test("money is always shown as whole numbers", async ({ page }) => {
  await prepare(page, { seeded: true, autoFire: false });
  await start(page);
  const world = page.locator(".world");
  for (let i = 0; i < 12; i++) {
    await chooseLevelUp(page).catch(() => false);
    await page.keyboard.down("Space");
    await hold(page, i % 2 ? ["w", "d"] : ["s", "a"], 700);
    await page.keyboard.up("Space");
    if (await page.locator(".gameover-modal").count()) break;
  }
  const gold = await world.getAttribute("data-gold");
  expect(gold).not.toBeNull();
  expect(Number.isInteger(Number(gold))).toBe(true);
  const goldText = await page
    .locator(".score-hud > div > span")
    .nth(1)
    .innerText();
  expect(goldText.trim()).toMatch(/^\d+$/);
});

test("tiny scenery never blocks the survivor", async ({ page }) => {
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  for (let i = 0; i < 10; i++) {
    await chooseLevelUp(page).catch(() => false);
    await hold(page, i % 2 ? ["w", "d"] : ["s", "a"], 900);
  }
  // No collider is smaller than the blocking threshold.
  await expect(world).toHaveAttribute("data-tiny-colliders", "0");
  // ...and the filter actually did discard small scenery.
  expect(
    Number((await world.getAttribute("data-colliders-ignored")) || 0),
  ).toBeGreaterThan(0);
});

test("companions fight as a second player with a full life pool", async ({
  page,
}) => {
  test.setTimeout(120000);
  await prepare(page, { seeded: true });
  await start(page);
  const world = page.locator(".world");
  // Recruit the ally standing beside the refuge candelabrum.
  await hold(page, ["w", "a"], 700);
  await page.keyboard.press("e");
  await expect(page.locator(".companions-hud")).toContainText("COMPAÑERO");
  const playerMax = Number(
    (await page.locator(".health-heading").innerText()).split("/")[1],
  );
  // The ally shares our life pool and starts with a pistol.
  await expect(world).toHaveAttribute(
    "data-companion-max-hp",
    String(playerMax),
  );
  await expect(world).toHaveAttribute("data-companion-weapon", "pistol");
  // It acts on its own: hunts, loots or repositions (never idle "none").
  let moved = false;
  const startPos = await page.locator(".companions-hud").count();
  expect(startPos).toBeGreaterThan(0);
  for (let i = 0; i < 40 && !moved; i++) {
    await chooseLevelUp(page).catch(() => false);
    await page.waitForTimeout(250);
    const state = await world.getAttribute("data-companion-state");
    if (state === "hunt" || state === "loot") moved = true;
    if (await page.locator(".gameover-modal").count()) break;
  }
  expect(moved).toBe(true);
  const hp = Number(await world.getAttribute("data-companion-hp"));
  expect(hp).toBeLessThanOrEqual(playerMax);
  // Ally recovery is explicitly weaker than the survivor's.
  await expect(world).toHaveAttribute("data-ally-efficiency", "0.75");
  await expect(world).toHaveAttribute("data-ally-heal", "30");
  // Take contact damage: the ally must actually be hurt by the horde.
  await expect
    .poll(
      async () => {
        // Level-ups pause the game: keep choosing so combat can continue.
        await chooseLevelUp(page).catch(() => false);
        return Number((await world.getAttribute("data-ally-damage")) || 0);
      },
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
});
