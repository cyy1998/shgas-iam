import { expect, test } from "bun:test";
import { z } from "zod";
import { startOidcBrowserFixture } from "./oidc-browser.fixture";

test("browser fixture startup failure closes both real HTTP servers before returning", async () => {
  const failure = await startOidcBrowserFixture(true).catch((error) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  const cleanupReport = String(failure.errors[1]);
  expect(cleanupReport).toContain("Browser fixture Token request failed");
  const receipt = z
    .object({ origin: z.url(), rp: z.url() })
    .parse(JSON.parse(/fixture-created:(\{[^\n]+\})/u.exec(cleanupReport)![1]!));
  for (const endpoint of [receipt.origin, receipt.rp]) {
    const connection = await fetch(endpoint, { signal: AbortSignal.timeout(1000) }).catch((error) => error);
    expect(connection).toBeInstanceOf(Error);
  }
}, 30000);
