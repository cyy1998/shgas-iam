import { expect, test } from "bun:test";
import process from "node:process";
import { fixture } from "~api/test-integration/authentication/root-authentication.fixture";

test("the protocol fixture requires its dedicated Redis URL before creating state", async () => {
  const previous = process.env.IAM_API_TEST_REDIS_URL;
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    delete process.env.IAM_API_TEST_REDIS_URL;
    let error: unknown;
    try {
      f = await fixture();
    } catch (failure) {
      error = failure;
    }
    expect(error).toMatchObject({ message: "IAM_API_TEST_REDIS_URL is required" });
  } finally {
    if (previous === undefined) delete process.env.IAM_API_TEST_REDIS_URL;
    else process.env.IAM_API_TEST_REDIS_URL = previous;
    await f?.scope.close();
  }
});
