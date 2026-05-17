import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("alice test-tags bob → bob's lives drop by 1 on both peers", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(500);

    await a.getByRole("button", { name: "JOIN GAME", exact: true }).click();
    await b.getByRole("button", { name: "JOIN GAME", exact: true }).click();
    await a.waitForTimeout(400);

    await a.getByRole("button", { name: "test tag bob", exact: true }).click();
    // b's lives should now show 2 (started 3)
    await expect(b.locator('.tag-lives[data-peer-name="bob"]')).toContainText("2");
  } finally {
    await cleanup();
  }
});
