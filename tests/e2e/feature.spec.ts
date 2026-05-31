import { expect, test, type Page } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/** Fire a synthetic deviceorientation event with the given compass alpha.
 *  useCompass() maps alpha → heading via (360 - alpha) % 360. */
async function aim(page: Page, alpha: number) {
  await page.evaluate((a) => {
    window.dispatchEvent(
      new DeviceOrientationEvent("deviceorientation", {
        alpha: a,
        beta: 0,
        gamma: 0,
      } as DeviceOrientationEventInit),
    );
  }, alpha);
}

test("alice test-tags bob → bob's lives drop by 1 on both peers", async ({ browser, baseURL }) => {
  // Fallback path: the on-screen "test tag" button keeps the feature usable on
  // desktop and exercisable headless. Kept intentionally per the fix policy.
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(500);

    await a.getByRole("button", { name: "JOIN GAME", exact: true }).click();
    await b.getByRole("button", { name: "JOIN GAME", exact: true }).click();
    await a.waitForTimeout(400);

    await a.getByRole("button", { name: "test tag bob", exact: true }).click();
    await expect(b.locator('.tag-lives[data-peer-name="bob"]')).toContainText("2");
  } finally {
    await cleanup();
  }
});

test("alice AIMS at bob with the compass and HOLDS 2s → bob's lives drop on both peers", async ({
  browser,
  baseURL,
}) => {
  // The ADVERTISED core action: phone-as-laser, compass aim, hold-lock 2s.
  // Drives the real path on peer A (arm the sensor gate, dispatch synthetic
  // deviceorientation so the compass points at bob's radar bearing, hold), and
  // asserts the tag genuinely crosses the mesh to peer B.
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    // Let presence settle so alice sees exactly one other peer (bob), whose
    // fallback radar bearing is 0° (north).
    await expect(a.locator(".tag-peer-row")).toHaveCount(2);
    await b.getByRole("button", { name: "JOIN GAME", exact: true }).click();

    // Arm the sensor gate so useCompass starts listening for orientation.
    await a.getByRole("button", { name: "tap to enable compass + GPS" }).click();

    // bob has no GPS fix → fallback bearing is 0° (north). alpha=0 → heading 0°,
    // so the phone points straight at bob (inside the ±18° aim cone).
    await aim(a, 0);
    // The aim indicator should now report it is locked on bob.
    await expect(a.locator(".tag-armed")).toHaveAttribute("data-aimed-name", "bob");

    // Hold the aim past the 2s hold-lock. Re-dispatch a few frames so the
    // compass heading stays put while the rAF hold-loop counts up.
    for (let i = 0; i < 6; i++) {
      await aim(a, 0);
      await a.waitForTimeout(450);
    }

    // The hold-lock fired tagPeer(bob) on alice; the Yjs mutation must show up
    // on BOTH peers. Bob loses at least one life vs. the START_LIVES of 3.
    await expect(b.locator('.tag-lives[data-peer-name="bob"]')).not.toContainText("3");
    await expect(a.locator('.tag-lives[data-peer-name="bob"]')).not.toContainText("3");

    // And the tag log on bob's side records alice as the tagger.
    await expect(b.locator(".tag-log")).toContainText("alice");
  } finally {
    await cleanup();
  }
});

test("aiming AWAY from bob (no peer in the cone) does NOT tag him", async ({
  browser,
  baseURL,
}) => {
  // Negative control: proves the hold-lock is gated by real aim, not a timer.
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await expect(a.locator(".tag-peer-row")).toHaveCount(2);

    await a.getByRole("button", { name: "tap to enable compass + GPS" }).click();

    // bob's fallback bearing is 0°. Point at 180° (alpha=180 → heading 180°),
    // the opposite direction — bob is well outside the ±18° cone.
    for (let i = 0; i < 5; i++) {
      await aim(a, 180);
      await a.waitForTimeout(450);
    }
    await expect(a.locator(".tag-armed")).toHaveAttribute("data-aimed-name", "");

    // bob still has all 3 lives on both peers.
    await expect(b.locator('.tag-lives[data-peer-name="bob"]')).toContainText("3");
    await expect(a.locator('.tag-lives[data-peer-name="bob"]')).toContainText("3");
  } finally {
    await cleanup();
  }
});
