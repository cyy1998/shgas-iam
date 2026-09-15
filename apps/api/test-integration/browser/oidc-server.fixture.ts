import process from "node:process";
import { ClientSsoProtocol } from "@iam/contracts";
import { cleanupAfterFixtureFailure, closeFixtureResources, fixture } from "../redis/oidc.fixture";

async function main() {
  let running: Awaited<ReturnType<typeof fixture>> | undefined;
  const rp = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("<p>RP</p>", { headers: { "Content-Type": "text/html" } }),
  });
  const logoutUri = `${rp.url.origin}/logout`;
  async function close() {
    const current = running;
    running = undefined;
    await closeFixtureResources([() => current?.close(), () => rp.stop(true)]);
  }
  try {
    running = await fixture(undefined, true, undefined, 45, undefined, false);
    process.stderr.write(
      `fixture-created:${JSON.stringify({ origin: running.httpOrigin, rp: rp.url.origin })}\n`,
    );
    if (process.argv.includes("--fail-token"))
      running.state.signFailure = true;
    await running.setClient(value => ({
      ...value,
      ssoConfig:
        value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
          ? { ...value.ssoConfig, postLogoutRedirectUris: [logoutUri] }
          : value.ssoConfig,
    }));
    const token = await running.login();
    const authorization = await running.authorize({ scope: "openid" });
    const code = new URL(authorization.headers.get("Location")!).searchParams.get("code")!;
    const response = await running.request("/oidc/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: running.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://rp.example/callback",
        code_verifier: "v".repeat(43),
      }),
    });
    if (response.status !== 200)
      throw new Error("Browser fixture Token request failed");
    const tokens = await response.json();
    process.stdout.write(
      `${JSON.stringify({ origin: running.httpOrigin, logoutUri, token, clientId: running.clientId, ...tokens })}\n`,
    );
    // Parent closes stdin on every success/failure path. No external runtime or persistent server.
    for await (const _chunk of process.stdin) {
      // Drain until the parent closes its ownership channel.
    }
  }
  catch (failure) {
    await cleanupAfterFixtureFailure(failure, close);
  }
  await close();
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
