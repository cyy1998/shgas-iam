import { test as base } from "@playwright/test";
import { attachBrowserEvidence } from "./failure-report/browser-evidence.ts";
import { installGatewayDns } from "./gateway-dns.ts";
import { type HybridRunContext, readHybridRunContext, requestHybridControl } from "./hybrid-context.ts";

// APIRequestContext runs in Node and does not use Chromium's resolver rules.
// Each worker restores its resolver when the fixture closes, including failures.
export const test = base.extend<
  { hybridReset: undefined; runtime: HybridRunContext; browserEvidence: undefined },
  { gatewayDns: undefined }
>({
  hybridReset: [
    async ({ gatewayDns: _gatewayDns }, use, testInfo) => {
      if (process.env.IAM_E2E_CONTEXT_PATH) {
        if (testInfo.config.workers !== 1) throw new Error("Hybrid E2E requires one Playwright worker for file resets");
        const context = await readHybridRunContext();
        const run = process.env.IAM_E2E_PLAYWRIGHT_RUN ?? context.runId;
        await requestHybridControl(context, "/reset", { file: `${run}:${testInfo.repeatEachIndex}:${testInfo.file}` });
      }
      await use(undefined);
    },
    { scope: "test", auto: true, timeout: 120_000 },
  ],
  runtime: async ({ hybridReset: _hybridReset }, use) => {
    await use(await readHybridRunContext());
  },
  browserEvidence: [
    async ({ hybridReset: _hybridReset, browser }, use, testInfo) => attachBrowserEvidence(browser, use, testInfo),
    { auto: true },
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
