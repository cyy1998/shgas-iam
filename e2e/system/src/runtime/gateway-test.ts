import { open } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { test as base } from "@playwright/test";
import { type E2ERunContext, readE2ERunContext, resetE2EState } from "./e2e-context.ts";
import { installGatewayDns } from "./gateway-dns.ts";

let lastResetKey: string | undefined;

async function claimPristineState(context: E2ERunContext) {
  try {
    // A new Playwright worker or a rerun in UI mode can share this same stack.
    const marker = await open(join(dirname(context.pgSnapshotPath), "playwright-started"), "wx", 0o600);
    await marker.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

// APIRequestContext runs in Node and does not use Chromium's resolver rules.
// Each worker restores its resolver when the fixture closes, including failures.
export const test = base.extend<{ runtime: E2ERunContext }, { gatewayDns: undefined }>({
  runtime: [
    async ({ gatewayDns: _gatewayDns }, use, testInfo) => {
      if (testInfo.config.workers !== 1)
        throw new Error("Container E2E requires one Playwright worker for file resets");
      const context = await readE2ERunContext();
      const resetKey = `${context.runId}:${testInfo.repeatEachIndex}:${testInfo.retry}:${testInfo.file}`;
      if (resetKey !== lastResetKey) {
        const pristine = lastResetKey === undefined && (await claimPristineState(context));
        if (!pristine || testInfo.retry !== 0 || testInfo.repeatEachIndex !== 0) {
          console.log(`[e2e] reset PostgreSQL, Redis and stubs for ${basename(testInfo.file)}`);
          await resetE2EState(context);
        }
        lastResetKey = resetKey;
      }
      await use(context);
    },
    { auto: true, timeout: 120_000 },
  ],
  gatewayDns: [
    async ({ playwright: _playwright }, use) => {
      const restore = installGatewayDns();
      try {
        await use(undefined);
      } finally {
        restore();
      }
    },
    { scope: "worker", auto: true },
  ],
});
