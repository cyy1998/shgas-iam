import { test as base } from "@playwright/test";
import { installGatewayDns } from "./gateway-dns.ts";

// APIRequestContext runs in Node and does not use Chromium's resolver rules.
// Each worker restores its resolver when the fixture closes, including failures.
export const test = base.extend<Record<never, never>, { gatewayDns: undefined }>({
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
