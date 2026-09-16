import { describe, expect, it } from "bun:test";
import { ClientSsoConfigSchema } from "../client-sso";

const config = {
  protocol: "custom-sso",
  callbackEndpoint: "https://app.example.com/login/finish",
  validRedirectUrls: ["https://app.example.com/home"],
  subjectClaims: ["subjectIdentifier"],
};

describe("explicit Custom SSO callback type", () => {
  it("requires an explicit type and accepts either type regardless of callback path", () => {
    expect(ClientSsoConfigSchema.safeParse(config).success).toBe(false);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "managed" }).success).toBe(true);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", callbackEndpoint: "https://app.example.com/sso/callback" }).success).toBe(true);
  });

  it("only allows ORCAS with a managed callback", () => {
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", orcas: { enabled: true } }).success).toBe(false);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "managed", orcas: { enabled: true } }).success).toBe(true);
    expect(ClientSsoConfigSchema.safeParse({ ...config, callbackType: "business", orcas: { enabled: false } }).success).toBe(true);
  });
});
