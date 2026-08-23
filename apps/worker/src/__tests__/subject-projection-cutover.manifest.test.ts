import { CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { SubjectProjectionCutoverManifestSchema } from "../commands/subject-projection-cutover.manifest";

const gatewayClient = {
  clientCode: "gateway-portal",
  targetEnabled: true,
  config: {
    mode: CustomSsoClientMode.Gateway,
    validRedirectUrls: ["https://portal.example.com/sso/*"],
    subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
    orcas: { enabled: true },
  },
  secretDelivery: { status: "not-required" },
} as const;

const independentClient = {
  clientCode: "independent-app",
  targetEnabled: true,
  config: {
    mode: CustomSsoClientMode.Independent,
    validRedirectUrls: ["https://app.example.com/sso/callback"],
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/logout",
  },
  secretDelivery: { status: "pending" },
} as const;

function manifest(clients: unknown[]) {
  return {
    version: 1 as const,
    cutoverId: "custom-sso-subject-projection-v1",
    clients,
  };
}

describe("Subject Projection cutover manifest", () => {
  test("accepts only explicit mode configuration and secret delivery state", () => {
    const parsed = SubjectProjectionCutoverManifestSchema.parse(manifest([
      gatewayClient,
      independentClient,
    ]));

    expect(parsed.cutoverId).toBe("custom-sso-subject-projection-v1");
    expect(parsed.clients.map(client => client.clientCode)).toEqual([
      "gateway-portal",
      "independent-app",
    ]);
  });

  test("rejects legacy bypasses, implicit claims, duplicate clients, and mode-incompatible delivery", () => {
    const invalidManifests = [
      manifest([{
        ...gatewayClient,
        config: {
          ...gatewayClient.config,
          userExcluding: ["alice"],
        },
      }]),
      manifest([{
        ...gatewayClient,
        config: {
          ...gatewayClient.config,
          subjectClaims: [],
        },
      }]),
      manifest([gatewayClient, gatewayClient]),
      manifest([{
        ...independentClient,
        secretDelivery: { status: "not-required" },
      }]),
      manifest([{
        ...gatewayClient,
        secretDelivery: { status: "confirmed" },
      }]),
    ];

    for (const input of invalidManifests) {
      expect(SubjectProjectionCutoverManifestSchema.safeParse(input).success).toBe(false);
    }
  });

  test("accepts only redirect patterns allowed by the runtime redirect matcher", () => {
    const acceptedPatterns = [
      "https://portal.example.com/sso/callback",
      "https://portal.example.com/sso/*",
      "https://*.example.com/sso/callback",
    ];
    for (const pattern of acceptedPatterns) {
      expect(SubjectProjectionCutoverManifestSchema.safeParse(manifest([{
        ...gatewayClient,
        config: {
          ...gatewayClient.config,
          validRedirectUrls: [pattern],
        },
      }])).success).toBe(true);
    }

    const rejectedPatterns = [
      "*",
      "https://*.*.example.com/sso/callback",
      "https://*.com/sso/callback",
      "https://portal.example.com/sso/callback*",
      "https://portal.example.com/sso/callback?return=/admin",
      "https://portal.example.com/sso/callback#fragment",
    ];
    for (const pattern of rejectedPatterns) {
      expect(SubjectProjectionCutoverManifestSchema.safeParse(manifest([{
        ...gatewayClient,
        config: {
          ...gatewayClient.config,
          validRedirectUrls: [pattern],
        },
      }])).success).toBe(false);
    }
  });
});
