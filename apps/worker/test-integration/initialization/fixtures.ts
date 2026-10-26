import { ClientSsoCallbackType, ClientSsoProtocol, OrganizationType, SubjectClaim, UserType } from "@iam/contracts";
import {
  InitializationInputSchema,
  resolveInitializationSecrets,
} from "../../src/commands/initialization/initialization-input";

export function fixtureInput() {
  const input = InitializationInputSchema.parse({
    admin: { username: "controlled-admin", name: "受控管理员", userType: UserType.External },
    organization: {
      orgCode: "controlled-root",
      orgName: "受控组织",
      orgType: OrganizationType.Virtual,
      isEntity: false,
      isVirtual: true,
    },
    position: { posCode: "controlled-operator", posName: "受控维护岗位" },
    adminRoleName: "IAM 管理员",
    clients: ["iam", "iam-admin", "gds"].map((clientCode) => ({
      clientCode,
      clientName: clientCode,
      url: "http://approved.test:18031/",
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        validRedirectUrls: ["http://approved.test:18031/*"],
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername, SubjectClaim.IamAuthorization],
      },
    })),
  });
  const secrets = resolveInitializationSecrets(
    Object.fromEntries(
      [
        "ADMIN_PASSWORD",
        "IAM_CLIENT_SECRET",
        "IAM_SSO_SECRET",
        "ADMIN_CLIENT_SECRET",
        "ADMIN_SSO_SECRET",
        "GDS_CLIENT_SECRET",
        "GDS_SSO_SECRET",
      ].map((name) => [`IAM_INITIAL_${name}`, `controlled-${name}`]),
    ),
  );
  return { input, secrets };
}
