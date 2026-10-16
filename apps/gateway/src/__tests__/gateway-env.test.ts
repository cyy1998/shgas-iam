import { expect, test } from "bun:test";
import { parseGatewayEnv } from "../env";

test("startup validates its own targets and budgets without disclosing invalid values", () => {
  const source = {
    IAM_GATEWAY_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
    IAM_GATEWAY_APISIX_ADMIN_URL: "http://127.0.0.1:9180/apisix/admin",
    IAM_GATEWAY_APISIX_ADMIN_KEY: "test-admin-key",
  };
  expect(parseGatewayEnv(source)).toMatchObject({
    port: 30004,
    hostname: "0.0.0.0",
    maxRequestBytes: 1048576,
    operationTimeoutMs: 60000,
    apisixRequestTimeoutMs: 10000,
    shutdownTimeoutMs: 70000,
  });
  let failure: unknown;
  try {
    parseGatewayEnv({
      ...source,
      IAM_GATEWAY_APISIX_ADMIN_URL: "http://test:do-not-disclose@localhost",
      IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS: "1",
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain("do-not-disclose");
  expect(String(failure)).toContain("IAM_GATEWAY_");
});
