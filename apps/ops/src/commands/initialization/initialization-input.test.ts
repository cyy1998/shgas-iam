import { expect, test } from "bun:test";
import { ClientSsoCallbackType, ClientSsoProtocol, OrganizationType, SubjectClaim, UserType } from "@iam/contracts";
import {
  type InitializationInput,
  InitializationInputSchema,
  resolveInitializationSecrets,
} from "./initialization-input";

function input(): InitializationInput {
  return {
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
    clients: (["iam", "iam-admin", "gds"] as const).map((clientCode) => ({
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
  };
}

test("正式初始化要求显式身份、组织和三个真实 Client，不补业务默认值", () => {
  expect(InitializationInputSchema.parse(input())).toEqual(input());
  expect(() => InitializationInputSchema.parse({ ...input(), organization: undefined })).toThrow();
  const duplicate = input();
  duplicate.clients[2] = duplicate.clients[0]!;
  expect(() => InitializationInputSchema.parse(duplicate)).toThrow();
});

test("Client 复用正式严格 SSO 合同，managed 不接受遗留 callbackEndpoint", () => {
  const value = input();
  Object.assign(value.clients[0]!.ssoConfig, { callbackEndpoint: "http://unapproved.test/callback" });
  expect(() => InitializationInputSchema.parse(value)).toThrow();
  expect(() => InitializationInputSchema.parse({ ...input(), password: "not-a-public-input" })).toThrow();
});

test("初始化 secret 分别注入，缺失报字段名且不回显 secret", () => {
  const environment = Object.fromEntries(
    [
      "ADMIN_PASSWORD",
      "IAM_CLIENT_SECRET",
      "IAM_SSO_SECRET",
      "ADMIN_CLIENT_SECRET",
      "ADMIN_SSO_SECRET",
      "GDS_CLIENT_SECRET",
      "GDS_SSO_SECRET",
    ].map((name) => [`IAM_INITIAL_${name}`, `controlled-${name}`]),
  );
  const secrets = resolveInitializationSecrets(environment);
  expect(secrets.adminPassword).toBe("controlled-ADMIN_PASSWORD");
  expect(secrets.clients.gds.clientSecret).toBe("controlled-GDS_CLIENT_SECRET");
  expect(secrets.clients["iam-admin"].ssoSecret).toBe("controlled-ADMIN_SSO_SECRET");
  delete environment.IAM_INITIAL_GDS_CLIENT_SECRET;
  let failure: unknown;
  try {
    resolveInitializationSecrets(environment);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain("IAM_INITIAL_GDS_CLIENT_SECRET");
  expect(String(failure)).not.toContain("controlled-");
});
