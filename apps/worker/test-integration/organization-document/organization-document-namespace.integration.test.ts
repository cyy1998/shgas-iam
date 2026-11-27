import { expect, test } from "bun:test";
import { parseFixtureWorkerEnv } from "../support/worker-composition.fixture";

test("Worker refuses a non-default organization namespace before starting its runtime", () => {
  let failure: unknown;
  try {
    parseFixtureWorkerEnv({
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL: "postgresql://iam:private-namespace-secret@127.0.0.1:1/iam",
      IAM_WORKER_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_WORKER_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "unsupported-private-prefix",
    });
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).toContain("Organization Search queue prefix is fixed to iam");
  expect(String(failure)).not.toContain("private-namespace-secret");
});
