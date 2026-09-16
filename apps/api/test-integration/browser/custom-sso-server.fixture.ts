import process from "node:process";
import { ClientSsoCallbackType, ClientSsoProtocol, SubjectClaim } from "@iam/contracts";
import { fixture } from "../redis/root-authentication.fixture";

async function main() {
  const f = await fixture();
  let iam: ReturnType<typeof Bun.serve> | undefined;
  let proxy: ReturnType<typeof Bun.serve> | undefined;
  async function close() {
    const results = await Promise.allSettled([proxy?.stop(true), iam?.stop(true), f.scope.close()]);
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length > 0)
      throw new AggregateError(failures.map(result => result.reason), "Custom browser fixture cleanup failed");
  }
  try {
    iam = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: f.app.fetch });
    const iamOrigin = iam.url.origin;
    let callbackQuery = "";
    proxy = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/login/finish") {
          callbackQuery = url.search;
          const upstream = await fetch(`${iamOrigin}/sso/callback${url.search}`, { redirect: "manual" });
          return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
        }
        return Response.json({ cookie: request.headers.get("Cookie"), callbackQuery });
      },
    });
    const businessOrigin = `http://localhost:${proxy.port}`;
    const redirectUrl = `${businessOrigin}/done`;
    f.setClient({
      ...f.getClient(),
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        callbackEndpoint: `${businessOrigin}/login/finish?tenant=fixed&state=configured-state`,
        validRedirectUrls: [redirectUrl],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
      },
    });
    const token = await f.login();
    process.stdout.write(`${JSON.stringify({ iamOrigin, businessOrigin, redirectUrl, token })}\n`);
    for await (const _chunk of process.stdin) {
      // EOF is the parent's ownership signal.
    }
  }
  finally {
    await close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
