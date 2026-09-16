import { describe, expect, it } from "bun:test";
import { ClientSsoConfigSchema } from "../client-sso";

const config = {
  protocol: "custom-sso",
  validRedirectUrls: ["https://app.example.com/home"],
  subjectClaims: ["subjectIdentifier"],
};

describe("explicit Custom SSO callback type", () => {
  it("requires an explicit type and accepts either type regardless of callback path", () => {
    expect(ClientSsoConfigSchema.safeParse(config).success).toBe(false);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "managed" }).success).toBe(true);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", callbackEndpoint: "https://app.example.com/sso/callback" }).success).toBe(true);
  });

  it("rejects managed address fields and requires a valid business address", () => {
    for (const callbackEndpoint of [null, "", "https://app.example/cb"])
      expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "managed", callbackEndpoint }).success).toBe(false);
    for (const callbackEndpoint of [undefined, null, "", "ftp://app.example/cb", "https://app.example/cb#fragment"])
      expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", callbackEndpoint }).success).toBe(false);
  });

  it("only allows ORCAS with a managed callback", () => {
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", callbackEndpoint: "https://app.example.com/cb", orcas: { enabled: true } }).success).toBe(false);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "managed", orcas: { enabled: true } }).success).toBe(true);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", callbackEndpoint: "https://app.example.com/cb", orcas: { enabled: false } }).success).toBe(true);
  });
});
