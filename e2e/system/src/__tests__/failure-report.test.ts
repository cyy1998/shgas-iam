import { expect, test } from "bun:test";
import type { FailureReport } from "../failure-report/report-format.ts";
import { renderFailureReport } from "../failure-report/report-format.ts";

test("both formats keep diagnostics while removing credentials from untrusted report fields", () => {
  const report: FailureReport = {
    runId: "run-one",
    errors: ['received {"auth":{"client_secret":"nested-secret"},"next":"hidden"}'],
    failures: [
      {
        title: "login rejected",
        project: "chromium",
        file: "login.spec.ts",
        line: 42,
        retry: 0,
        status: "failed",
        window: { start: 100, end: 200 },
        errors: [
          "Expected good state\nReceived configured-password",
          "cookie: first=first-cookie; second=second-cookie",
          'Expected: "us_SyntheticSessionValue1234567890"\nReceived: "cs_SyntheticClientValue1234567890"',
        ],
        steps: [{ title: "login step", error: "Authorization: Bearer authorization-secret" }],
        artifacts: [{ name: "trace", path: "/tmp/trace.zip" }],
        browserErrors: [
          {
            type: "pageerror",
            message: "page failed: https://user:url-password@iam.local/portal?code=auth-code#token",
          },
          { type: "console.error", message: 'browser failed: {"password":"quoted secret with spaces"}' },
        ],
        responses: [
          {
            url: "http://iam.local/admin/trpc/list?input=%7B%22secret%22%3A%22input-secret%22%7D",
            method: "POST",
            status: 403,
            summary: 'FORBIDDEN: {\\"accessToken\\":\\"escaped-secret\\"}',
            headers: { "x-request-id": "req-one" },
          },
        ],
        logs: {
          api: {
            entries: [
              { text: "provider failed Basic basic-secret", count: 2 },
              { text: "GET /sso/wechat-qr/mobile/confirm/qr-session-secret 502", count: 1 },
              {
                text: "private signing key -----BEGIN PRIVATE KEY-----\nkey-material\n-----END PRIVATE KEY-----",
                count: 1,
              },
              { text: "POST /oidc/callback?code=relative-secret 502", count: 1 },
            ],
            omitted: 4,
          },
        },
      },
    ],
  };

  const { json, markdown } = renderFailureReport(report, ["configured-password"]);
  for (const rendered of [json, markdown]) {
    for (const secret of [
      "nested-secret",
      "configured-password",
      "first-cookie",
      "second-cookie",
      "us_SyntheticSessionValue1234567890",
      "cs_SyntheticClientValue1234567890",
      "authorization-secret",
      "url-password",
      "auth-code",
      "quoted secret",
      "input-secret",
      "escaped-secret",
      "basic-secret",
      "qr-session-secret",
      "key-material",
      "relative-secret",
    ]) {
      expect(rendered).not.toContain(secret);
    }
    for (const detail of [
      "run-one",
      "login rejected",
      "login step",
      "Expected good state",
      "trace.zip",
      "iam.local/portal",
      "FORBIDDEN",
      "req-one",
      "provider failed",
      "/oidc/callback",
    ]) {
      expect(rendered).toContain(detail);
    }
  }
  expect(JSON.parse(json)).toMatchObject({
    failures: [{ logs: { api: { entries: [{ count: 2 }, {}, {}, {}], omitted: 4 } } }],
  });
  expect(markdown).toContain("provider failed");
});
