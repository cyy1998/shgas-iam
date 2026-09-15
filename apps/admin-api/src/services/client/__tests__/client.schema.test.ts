import { GenericClientRuntimeDtoSchema } from "@iam/domain/client";
import { describe, expect, test } from "bun:test";
import {
  AdminClientRecordSchema,
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientUpdateDtoSchema,
} from "../client.schema";

describe("client update contracts", () => {
  test.each([
    "_legacy",
    "legacy:client",
    "中文客户端",
    "legacy/client",
  ])("preserves the existing Client Code value space for %s", (clientCode) => {
    expect(ClientCreateDtoSchema.safeParse({
      clientCode,
      clientName: "Legacy Client",
      clientSecret: "general-secret",
    }).success).toBe(true);
    expect(ClientInputDtoSchema.safeParse({
      id: 1,
      clientCode,
    }).success).toBe(true);
  });

  test.each(["", "a".repeat(65)])(
    "rejects an out-of-range Client Code",
    (clientCode) => {
      expect(ClientCreateDtoSchema.safeParse({
        clientCode,
        clientName: "Invalid Client",
        clientSecret: "general-secret",
      }).success).toBe(false);
    },
  );

  test("parses empty extAttributes and rejects unknown attributes at both record boundaries", () => {
    for (const schema of [
      AdminClientRecordSchema.shape.extAttributes,
      GenericClientRuntimeDtoSchema.shape.extAttributes,
    ]) {
      expect(schema.parse({})).toEqual({});
      expect(schema.safeParse({ unexpectedAttribute: "value" }).success).toBe(false);
    }
  });

  test("rejects clientCode in the current REST/tRPC update contract", () => {
    const result = ClientUpdateDtoSchema.safeParse({ clientCode: "renamed-client" });

    expect(result.success).toBe(false);
  });

  test("keeps clientCode in the legacy update contract for explicit immutability validation", () => {
    const result = ClientInputDtoSchema.safeParse({ id: 1, clientCode: "renamed-client" });

    expect(result.success).toBe(true);
  });

  test("rejects managed Custom SSO fields and unknown extAttributes in generic inputs", () => {
    for (const field of [
      "customSsoEnabled",
      "customSsoConfig",
      "customSsoSecretHash",
      "customSsoConfigVersion",
    ]) {
      expect(ClientUpdateDtoSchema.safeParse({ [field]: null }).success).toBe(false);
      expect(ClientInputDtoSchema.safeParse({
        id: 1,
        clientCode: "portal",
        [field]: null,
      }).success).toBe(false);
    }

    expect(ClientUpdateDtoSchema.safeParse({
      extAttributes: { unexpectedAttribute: "value" },
    }).success).toBe(false);

    expect(ClientCreateDtoSchema.safeParse({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "general-secret",
    })).toMatchObject({
      success: true,
      data: { extAttributes: {} },
    });
  });
});
