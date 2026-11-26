import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, SubjectClaim } from "@iam/contracts";
import type { clients } from "@iam/db/schema";

export const personalDelegationClient = {
  clientCode: "iam",
  clientName: "IAM Portal",
  clientSecret: "personal-delegation-fixture",
  extAttributes: {},
  status: ClientStatus.Enable,
  ssoEnabled: true,
  ssoConfig: {
    protocol: ClientSsoProtocol.CustomSso,
    callbackType: ClientSsoCallbackType.Managed,
    validRedirectUrls: ["https://iam.example.test/portal/*"],
    subjectClaims: [SubjectClaim.SubjectIdentifier],
  },
} satisfies typeof clients.$inferInsert;
