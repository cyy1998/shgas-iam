import {
  ClientStatus,
  UserStatus,
} from "@iam/contracts";
import { describe, expect, it } from "vitest";
import {
  isOidcAccountAvailable,
  isOidcClientAvailable,
} from "../repositories/availability.ts";

const activeClient = {
  status: ClientStatus.Enable,
  isDelete: false,
  oidcEnabled: true,
  oidcConfig: {},
};

describe("oIDC repository availability", () => {
  it.each([
    ["maintenance", { ...activeClient, status: ClientStatus.Maintance }],
    ["disabled", { ...activeClient, status: ClientStatus.Disable }],
    ["deleted", { ...activeClient, isDelete: true }],
    ["OIDC disabled", { ...activeClient, oidcEnabled: false }],
    ["OIDC unconfigured", { ...activeClient, oidcConfig: null }],
  ])("rejects an unavailable %s client", (_label, client) => {
    expect(isOidcClientAvailable(client as never)).toBe(false);
  });

  it("accepts only enabled, non-deleted users", () => {
    expect(isOidcAccountAvailable({ status: UserStatus.Enable, isDelete: false })).toBe(true);
    expect(isOidcAccountAvailable({ status: UserStatus.Pause, isDelete: false })).toBe(false);
    expect(isOidcAccountAvailable({ status: UserStatus.Disable, isDelete: false })).toBe(false);
    expect(isOidcAccountAvailable({ status: UserStatus.Enable, isDelete: true })).toBe(false);
  });
});
