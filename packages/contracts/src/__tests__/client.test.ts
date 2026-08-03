import { ClientCodeSchema } from "@iam/contracts";
import * as contracts from "@iam/contracts";
import { describe, expect, test } from "bun:test";

describe("ClientCodeSchema", () => {
  test.each([
    "_legacy",
    "legacy:client",
    "中文客户端",
    "legacy/client",
    "😀".repeat(64),
  ])("accepts the existing database Client Code %s", (clientCode) => {
    expect(ClientCodeSchema.safeParse(clientCode).success).toBe(true);
  });

  test.each([
    "",
    "a".repeat(65),
    "😀".repeat(65),
  ])("rejects an out-of-range Client Code", (clientCode) => {
    expect(ClientCodeSchema.safeParse(clientCode).success).toBe(false);
  });
});

describe("Custom SSO Client public contract", () => {
  test("does not publish the legacy management-level vocabulary", () => {
    expect(contracts).not.toHaveProperty("ClientManagementLevel");
    expect(contracts).not.toHaveProperty("clientManagementLevelToString");
    expect(contracts).not.toHaveProperty("getClientManagementLevelOptions");
  });
});
