import {
  ClientSsoCallbackType,
  ClientSsoProtocol,
  ClientStatus,
  EmploymentStatus,
  OidcClientType,
  OidcScope,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
  SubjectClaim,
  UserStatus,
} from "@iam/contracts";
import type { clients } from "@iam/db/schema";
import { smsBindingMobile, smsBindingUsername } from "../stubs/sms-provider";
import { wecomBoundMember, wecomUnlinkMember } from "../stubs/wecom-provider";
import type { E2EScenarioOwner, E2EScenarioSeedReferences } from "./seed.ts";
import type { CreateProductionE2EScenarioOwnerInput } from "./seed-owner.ts";

type SeedClient = typeof clients.$inferInsert;

export function createSeedClients(
  scenario: Parameters<E2EScenarioOwner["establish"]>[0],
  input: Pick<CreateProductionE2EScenarioOwnerInput, "clock" | "random">,
) {
  const entryOrigins = [...new Set([scenario.canonicalOrigin, scenario.internalOrigin ?? scenario.canonicalOrigin])];
  const withClientDefaults = ({
    clientSecret,
    ...client
  }: Omit<SeedClient, "clientSecret" | "extAttributes"> & { clientSecret?: string }): SeedClient => ({
    status: ClientStatus.Enable,
    extAttributes: {},
    clientSecret: clientSecret ?? input.random.uuid(),
    ssoSecret: null,
    ...client,
  });

  return [
    withClientDefaults({
      clientCode: "iam",
      clientName: `E2E IAM Gateway ${scenario.runId}`,
      clientSecret: scenario.gatewayApiKey,
      url: `${scenario.canonicalOrigin}/portal`,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        validRedirectUrls: entryOrigins.map((origin) => `${origin}/portal/*`),
        subjectClaims: [
          SubjectClaim.SubjectIdentifier,
          SubjectClaim.ProfileUsername,
          SubjectClaim.ProfileName,
          SubjectClaim.ProfilePhone,
          SubjectClaim.ProfileEmployments,
        ],
      },
    }),
    withClientDefaults({
      clientCode: scenario.adminClientCode,
      clientName: `E2E Admin ${scenario.runId}`,
      url: `${scenario.canonicalOrigin}/iam-admin`,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        validRedirectUrls: [scenario.adminRedirectUri],
        subjectClaims: [
          SubjectClaim.SubjectIdentifier,
          SubjectClaim.ProfileUsername,
          SubjectClaim.ProfileName,
          SubjectClaim.IamAuthorization,
        ],
      },
    }),
    withClientDefaults({
      clientCode: scenario.customSsoClientCode,
      clientName: `E2E Custom SSO Target ${scenario.runId}`,
      url: scenario.customSsoRedirectUri,
      ssoEnabled: false,
      ssoConfig: null,
    }),
    withClientDefaults({
      clientCode: scenario.internalClientCode,
      clientName: `E2E Internal Client ${scenario.runId}`,
      clientSecret: scenario.internalApiKey,
      url: `${scenario.canonicalOrigin}/e2e/internal`,
    }),
    withClientDefaults({
      clientCode: scenario.oidcClientCode,
      clientName: `E2E OIDC RP ${scenario.runId}`,
      url: scenario.oidcRedirectUri,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Public,
        redirectUris: [scenario.oidcRedirectUri],
        postLogoutRedirectUris: [scenario.oidcPostLogoutRedirectUri],
        allowedScopes: [OidcScope.OpenId, OidcScope.Profile, OidcScope.IamEmployments],
      },
    }),
    withClientDefaults({
      clientCode: `${scenario.oidcClientCode}-dual`,
      clientName: `E2E Dual Entry RP ${scenario.runId}`,
      url: scenario.oidcRedirectUri,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Public,
        redirectUris: [scenario.oidcRedirectUri],
        postLogoutRedirectUris: [scenario.oidcPostLogoutRedirectUri],
        allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
      },
    }),
    withClientDefaults({
      clientCode: `${scenario.customSsoClientCode}-dual`,
      clientName: `E2E Managed Origins ${scenario.runId}`,
      url: `${scenario.canonicalOrigin}/e2e/custom-sso/callback`,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        validRedirectUrls: entryOrigins.map((origin) => `${origin}/e2e/custom-sso/*`),
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername],
      },
    }),
    withClientDefaults({
      clientCode: `${scenario.customSsoClientCode}-business`,
      clientName: `E2E Business Callback ${scenario.runId}`,
      clientSecret: input.random.uuid(),
      url: `${scenario.canonicalOrigin}/e2e/business/callback`,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Business,
        callbackEndpoint: `${scenario.canonicalOrigin}/e2e/business/callback?registered=1`,
        validRedirectUrls: entryOrigins.map((origin) => `${origin}/e2e/business/*`),
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername, SubjectClaim.ProfileEmployments],
      },
      ssoSecret: "e2e-business-secret-local-only",
      ssoCredentialId: input.random.uuid(),
      ssoSecretUpdatedAt: input.clock.nowDate().toISOString(),
    }),
  ];
}

export function createSeedPositions(scenario: E2EScenarioSeedReferences) {
  const fixtures = [
    [scenario.positionCode, "Position"],
    [scenario.responsibilityHolderPositionCode, "Responsibility Holder"],
    [scenario.globalPositionCode, "Global Position"],
    [scenario.outsideResponsibilityHolderPositionCode, "Outside Responsibility Holder"],
  ] as const;
  return fixtures.map(([posCode, name]) => ({
    posCode,
    posName: `E2E ${name} ${scenario.runId}`,
    status: PositionStatus.Enable,
  }));
}

export function createSeedUsers(scenario: E2EScenarioSeedReferences, passwordHash: string) {
  const { runId } = scenario;
  return [
    {
      subjectIdentifier: scenario.adminSubjectIdentifier,
      username: scenario.adminUsername,
      name: `E2E Admin ${runId}`,
      wxId: wecomBoundMember,
      password: passwordHash,
      status: UserStatus.Enable,
    },
    {
      subjectIdentifier: scenario.hrAdminSubjectIdentifier,
      username: scenario.hrAdminUsername,
      name: `E2E HR Admin ${runId}`,
      password: passwordHash,
      status: UserStatus.Enable,
    },
    {
      subjectIdentifier: scenario.delegateeSubjectIdentifier,
      username: scenario.delegateeUsername,
      name: `E2E Delegatee ${runId}`,
      wxId: wecomUnlinkMember,
      password: passwordHash,
      status: UserStatus.Enable,
    },
    {
      subjectIdentifier: scenario.pausedSubjectIdentifier,
      username: scenario.pausedUsername,
      name: `E2E Paused User ${runId}`,
      status: UserStatus.Pause,
    },
    {
      subjectIdentifier: scenario.disabledSubjectIdentifier,
      username: scenario.disabledUsername,
      name: `E2E Disabled User ${runId}`,
      status: UserStatus.Disable,
    },
    {
      subjectIdentifier: scenario.smsBindingSubjectIdentifier,
      username: smsBindingUsername,
      name: "E2E WeCom SMS User",
      mobile: smsBindingMobile,
      status: UserStatus.Enable,
    },
    {
      subjectIdentifier: scenario.noScopeHrAdminSubjectIdentifier,
      username: scenario.noScopeHrAdminUsername,
      name: `E2E No Scope HR Admin ${runId}`,
      password: passwordHash,
      status: UserStatus.Enable,
    },
  ];
}

export const seedEmployment = (
  userId: number,
  orgId: number,
  posId: number,
  options: { isPrimary?: boolean; status?: EmploymentStatus } = {},
) => ({ userId, orgId, posId, isPrimary: false, status: EmploymentStatus.Enable, ...options });

export const seedRole = (roleCode: string, name: string, clientId: number, runId: string) => ({
  roleCode,
  roleName: `E2E ${name} Role ${runId}`,
  clientId,
  status: RoleStatus.Enable,
});

export const seedEmploymentRoleAssignment = (roleId: number, targetId: number) => ({
  roleId,
  targetType: RoleAssignmentTargetType.Employment,
  targetId,
  includeDescendants: false,
});
