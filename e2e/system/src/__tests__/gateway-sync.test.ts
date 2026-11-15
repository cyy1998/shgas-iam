import { expect, test } from "bun:test";
import { publishGateway } from "../gateway-sync";

test("publishes the existing E2E topology through authenticated HTTP and verifies APISIX", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await publishGateway(
    {
      yaml: "upstreams:\n  - key: api\nroutes:\n  - key: sso-frontend\n    plugins: {}\n",
      variables: { IAM_SSO_INTERNAL_HOST: "internal.test:1234", IAM_SSO_EXTERNAL_HOST: "external.test:1234" },
      clientSecret: "synthetic-client-key",
      gatewayOrigin: "http://gateway-api:30004",
      adminUrl: "http://apisix:9180/apisix/admin",
      adminKey: "synthetic-admin-key",
    },
    async (input, init) => {
      requests.push({ url: String(input), init });
      return requests.length === 1
        ? Response.json({ code: 200, data: { outcome: "applied", written: true } })
        : Response.json({ value: { pass_host: "rewrite", upstream_host: "api.e2e.internal" } });
    },
  );
  expect(result.gatewayHostRewrite.verified).toBe(true);
  expect(requests[0]?.url).toBe("http://gateway-api:30004/apply");
  expect(requests[0]?.init?.headers).toEqual({ "content-type": "application/json", apikey: "synthetic-client-key" });
  const body = JSON.parse(String(requests[0]?.init?.body));
  expect(body).toMatchObject({
    scope: "e2e:iam",
    prune: true,
    variables: { IAM_SSO_INTERNAL_HOST: "internal.test:1234" },
  });
  expect(Bun.YAML.parse(body.yaml)).toMatchObject({
    upstreams: [{ key: "api", pass_host: "rewrite", upstream_host: "api.e2e.internal" }],
  });
  expect(JSON.stringify(result)).not.toMatch(/synthetic-/);
});

test("publishes the mobile TLS material through Gateway variables and keeps QR routes unsampled", async () => {
  let publication: { yaml: string; variables: Record<string, string> } | undefined;
  await publishGateway(
    {
      yaml: await Bun.file(new URL("../../test-assets/iam.yaml", import.meta.url)).text(),
      variables: {
        IAM_SSO_INTERNAL_HOST: "internal.iam.localhost:1234",
        IAM_SSO_EXTERNAL_HOST: "external.iam.localhost:1234",
      },
      wecomMobile: { authority: "external.iam.localhost:4321", cert: "fixture-cert", privateKey: "fixture-key" },
      clientSecret: "synthetic-client-key",
      gatewayOrigin: "http://gateway-api:30004",
      adminUrl: "http://apisix:9180/apisix/admin",
      adminKey: "synthetic-admin-key",
    },
    async (_input, init) => {
      if (init?.method !== "POST") {
        return Response.json({ value: { pass_host: "rewrite", upstream_host: "api.e2e.internal" } });
      }
      publication = JSON.parse(String(init.body));
      return Response.json({ code: 200, data: { outcome: "applied" } });
    },
  );

  if (!publication) throw new Error("Gateway publication was not requested");
  expect(publication.variables).toMatchObject({
    IAM_E2E_WECHAT_QR_TLS_CERT: "fixture-cert",
    IAM_E2E_WECHAT_QR_TLS_PRIVATE_KEY: "fixture-key",
  });
  expect(publication.yaml).not.toContain("fixture-key");
  expect(Bun.YAML.parse(publication.yaml)).toMatchObject({
    ssls: [
      {
        key: "wecom-mobile",
        private_key: `\${IAM_E2E_WECHAT_QR_TLS_PRIVATE_KEY}`,
        snis: ["external.iam.localhost"],
      },
    ],
    routes: expect.arrayContaining([
      expect.objectContaining({
        key: "wecom-mobile",
        vars: [
          ["http_host", "==", "external.iam.localhost:4321"],
          ["scheme", "==", "https"],
        ],
        plugins: expect.objectContaining({ opentelemetry: { sampler: { name: "always_off" } } }),
      }),
    ]),
  });
});
