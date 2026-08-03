import { expect, test } from "bun:test";
import * as dbSchema from "../index";

test("does not publish the legacy Custom SSO extAttributes schema", () => {
  expect("clientExtAttributesSchema" in dbSchema).toBe(false);
});

test("reuses the shared Client Code limits without narrowing legacy values", () => {
  for (const clientCode of [
    "_legacy",
    "legacy:client",
    "中文客户端",
    "legacy/client",
  ]) {
    expect(
      dbSchema.insertClientSchema.shape.clientCode
        .safeParse(clientCode)
        .success,
    ).toBe(true);
  }
  expect(
    dbSchema.insertClientSchema.shape.clientCode.safeParse("").success,
  ).toBe(false);
  expect(
    dbSchema.insertClientSchema.shape.clientCode
      .safeParse("a".repeat(65))
      .success,
  ).toBe(false);
});
