import { OidcScope } from "@iam/contracts";
import { describe, expect, it } from "vitest";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";

describe("oIDC protocol scope normalization", () => {
  it("preserves protocol order and duplicates across string, Set, and Array containers", () => {
    expect(normalizeOidcProtocolScopes({ scope: "profile openid profile" })).toEqual([
      OidcScope.Profile,
      OidcScope.OpenId,
      OidcScope.Profile,
    ]);
    expect(normalizeOidcProtocolScopes({ scopes: new Set([OidcScope.Phone, OidcScope.OpenId]) })).toEqual([
      OidcScope.Phone,
      OidcScope.OpenId,
    ]);
    expect(normalizeOidcProtocolScopes({ scopes: [OidcScope.OpenId, OidcScope.IamAuthorization] })).toEqual([
      OidcScope.OpenId,
      OidcScope.IamAuthorization,
    ]);
  });

  it("rejects a container when any scope is not in the supported OIDC vocabulary", () => {
    expect(normalizeOidcProtocolScopes({ scope: "openid unknown" })).toBeNull();
    expect(normalizeOidcProtocolScopes({ scopes: [OidcScope.OpenId, 42] })).toBeNull();
  });
});
