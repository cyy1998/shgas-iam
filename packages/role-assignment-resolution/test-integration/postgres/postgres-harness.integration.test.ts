import { describe, expect, test } from "bun:test";
import { databaseIdentity } from "./postgres-harness.ts";

describe("PostgreSQL test database identity", () => {
  test("treats protocol, credentials, host case, and the default port as connection details, not database identity", () => {
    const development = databaseIdentity("postgres://developer:secret@LOCALHOST/iam_development");
    const testCandidate = databaseIdentity("postgresql://test_user:other@localhost:5432/iam_development");

    expect(testCandidate).toBe(development);
  });

  test("distinguishes a different server port", () => {
    const first = databaseIdentity("postgres://test_user:secret@localhost:5432/iam_test");
    const second = databaseIdentity("postgres://test_user:secret@localhost:5433/iam_test");

    expect(second).not.toBe(first);
  });
});
