import { expect, test } from "bun:test";
import { managedIamFailure, parseManagedIamInput } from "../journeys/managed-iam-input";

function fixture() {
  return {
    environment: "shrq-srv-test" as const,
    origin: "http://176.169.99.150:18031",
    database: "iam_shrq_srv_test",
    databaseUrl: "postgresql://controlled:DUMMY_PG@127.0.0.1:23033/iam_shrq_srv_test",
    admin: { username: "controlled", password: "DUMMY_LOGIN" },
    redis: { host: "127.0.0.1", port: 18034, db: 1, password: "DUMMY_REDIS" },
  };
}

test("managed IAM binds the formal identity to its exact environment database and declared Redis space", () => {
  const value = fixture();
  expect(parseManagedIamInput(value)).toEqual(value);
  for (const altered of [
    { ...value, environment: "local-srv-dev" },
    { ...value, database: "dolphinscheduler" },
    { ...value, databaseUrl: "postgresql://controlled:DUMMY_PG@127.0.0.1:23033/postgres" },
    { ...value, redis: { ...value.redis, db: 16 } },
    { ...value, origin: "http://controlled:DUMMY_LOGIN@example.invalid" },
  ]) {
    expect(() => parseManagedIamInput(altered)).toThrow("托管 IAM 输入必须对应");
  }
});

test("managed browser failures retain native reasons while removing private inputs and callback grants", () => {
  const value = parseManagedIamInput(fixture());
  const error = managedIamFailure(
    new AggregateError(
      [
        new Error(`login DUMMY_LOGIN ${value.databaseUrl} DUMMY_REDIS`),
        new Error("navigation http://example.invalid/sso/callback?code=DUMMY_CODE&state=public"),
        new Error("Authorization: Bearer DUMMY_AUTH\nCookie: sid=DUMMY_COOKIE\nSet-Cookie: sid=DUMMY_SET_COOKIE"),
      ],
      "managed failure",
    ),
    value,
  );
  expect(error.message).toContain("managed failure");
  expect(error.message).toContain("state=[REDACTED]");
  expect(error.message).not.toMatch(/DUMMY_|postgresql:\/\//);
});
