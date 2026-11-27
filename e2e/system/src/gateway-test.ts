import { test as base, type TestInfo } from "@playwright/test";
import { type E2ERunContext, readE2ERunContext, requestE2EControl } from "./e2e-context.ts";
import { attachBrowserEvidence } from "./failure-report/browser-evidence.ts";
import { installGatewayDns } from "./gateway-dns.ts";

export function createE2EResetKey(run: string, testInfo: Pick<TestInfo, "repeatEachIndex" | "retry" | "file">) {
  return `${run}:${testInfo.repeatEachIndex}:${testInfo.retry}:${testInfo.file}`;
}

// APIRequestContext runs in Node and does not use Chromium's resolver rules.
// Each worker restores its resolver when the fixture closes, including failures.
export const test = base.extend<
  { e2eReset: undefined; runtime: E2ERunContext; browserEvidence: undefined },
  { gatewayDns: undefined }
>({
  e2eReset: [
    async ({ gatewayDns: _gatewayDns }, use, testInfo) => {
      if (process.env.IAM_E2E_CONTEXT_PATH) {
        if (testInfo.config.workers !== 1)
          throw new Error("Container E2E requires one Playwright worker for file resets");
        const context = await readE2ERunContext();
        const run = process.env.IAM_E2E_PLAYWRIGHT_RUN ?? context.runId;
        await requestE2EControl(context, "/reset", { file: createE2EResetKey(run, testInfo) });
      }
      await use(undefined);
    },
    { scope: "test", auto: true, timeout: 120_000 },
  ],
  runtime: async ({ e2eReset: _e2eReset }, use) => {
    await use(await readE2ERunContext());
  },
  browserEvidence: [
    async ({ e2eReset: _e2eReset, browser }, use, testInfo) => attachBrowserEvidence(browser, use, testInfo),
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
