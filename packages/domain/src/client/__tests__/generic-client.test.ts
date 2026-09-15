import {
  ClientStatus,
  SubjectClaim,
} from "@iam/contracts";
import { expect, test } from "bun:test";
import { toGenericClientRuntimeDto } from "../schema";

test("generic Client runtime exposes only the protocol-neutral storage projection", () => {
  const runtime = toGenericClientRuntimeDto({
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "general-secret",
    url: null,
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00.000Z"),
    updateTime: new Date("2026-01-01T00:00:00.000Z"),
    extAttributes: {
      managementLevel: "Gateway",
      requireOrcas: true,
    },
    ssoEnabled: true,
    ssoConfig: {
      protocol: "custom-sso",
      callbackEndpoint: "https://portal.example.com/sso/callback",
      validRedirectUrls: ["https://portal.example.com/*"],
      subjectClaims: [SubjectClaim.SubjectIdentifier],
    },
    ssoSecret: "sensitive-sso-secret",
    ssoCredentialId: "sensitive-identity",
    ssoSecretUpdatedAt: new Date(),
  });

  expect(runtime).toEqual({
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "general-secret",
    url: null,
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00.000Z"),
    updateTime: new Date("2026-01-01T00:00:00.000Z"),
    extAttributes: {},
  });
});
