import { expect, test } from "bun:test";
import { createProcessSmokeEnvironment } from "../process-smoke-harness";

test("process environment inherits the executable path and Linux process ownership markers", () => {
  const environment = createProcessSmokeEnvironment({
    source: {
      PATH: "/usr/bin",
      LD_LIBRARY_PATH: "/usr/lib",
      IAM_OWNED_PROCESS_MARKERS: '["parent"]',
      HTTP_PROXY: "http://proxy.invalid",
      DATABASE_URL: "production",
    },
    temporaryDirectory: "/tmp/owned",
    overrides: { NODE_ENV: "test", DATABASE_URL: "test" },
  });
  expect(environment).toEqual({
    PATH: "/usr/bin",
    LD_LIBRARY_PATH: "/usr/lib",
    IAM_OWNED_PROCESS_MARKERS: '["parent"]',
    NODE_ENV: "test",
    DATABASE_URL: "test",
    TMPDIR: "/tmp/owned",
  });
});
