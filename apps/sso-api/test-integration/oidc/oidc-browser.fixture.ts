import { z } from "zod";
import { startBrowserFixture } from "../support/fixture-process";

export async function startOidcBrowserFixture(failToken = false) {
  const running = await startBrowserFixture(
    "test-integration/oidc/oidc-server.fixture.ts",
    failToken ? ["--fail-token"] : [],
  );
  try {
    const seed = z
      .object({
        origin: z.url(),
        logoutUri: z.url(),
        token: z.string(),
        clientId: z.string(),
        id_token: z.string(),
        access_token: z.string(),
      })
      .parse(JSON.parse(running.ready));
    return { ...seed, close: running.close };
  } catch (failure) {
    await running.close();
    throw failure;
  }
}
