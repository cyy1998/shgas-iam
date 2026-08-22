import { CustomSsoClientMode, OidcClientType } from "@iam/contracts";

export interface E2EScenarioReferences {
  version: 1;
  runId: string;
  canonicalOrigin: string;
  adminSubjectIdentifier: string;
  adminUsername: string;
  organizationCode: string;
  responsibilityTargetOrganizationCode: string;
  positionCode: string;
  responsibilityHolderPositionCode: string;
  adminRoleCode: string;
  adminClientCode: string;
  adminRedirectUri: string;
  customSsoClientCode: string;
  customSsoRedirectUri: string;
  internalClientCode: string;
  oidcClientCode: string;
  oidcRedirectUri: string;
  oidcPostLogoutRedirectUri: string;
}

export type E2EScenarioIdentity = Pick<
  E2EScenarioReferences,
  | "adminUsername"
  | "organizationCode"
  | "responsibilityTargetOrganizationCode"
  | "positionCode"
  | "responsibilityHolderPositionCode"
  | "adminRoleCode"
  | "adminClientCode"
  | "customSsoClientCode"
  | "internalClientCode"
  | "oidcClientCode"
>;

export interface E2EScenarioReadBack {
  admin: {
    active: boolean;
    passwordConfigured: boolean;
    subjectIdentifier: string;
    username: string;
  };
  organization: { active: boolean; code: string };
  responsibilityTargetOrganization: { active: boolean; code: string };
  position: { active: boolean; code: string };
  employment: { active: boolean };
  responsibilityHolderEmployment: { active: boolean };
  role: { active: boolean; assigned: boolean; code: string };
  adminClient: {
    active: boolean;
    customSsoEnabled: boolean;
    clientCode: string;
    mode: CustomSsoClientMode | null;
    redirectUris: string[];
  };
  customSsoClient: {
    active: boolean;
    customSsoEnabled: boolean;
    clientCode: string;
    mode: CustomSsoClientMode | null;
    redirectUris: string[];
  };
  internalClient: { active: boolean; clientCode: string };
  oidcClient: {
    active: boolean;
    clientCode: string;
    clientType: OidcClientType | null;
    redirectUris: string[];
  };
  subjectAccess: "enabled" | "disabled" | "blocking" | "missing" | "invalid";
  subjectFacts: {
    ready: boolean;
    subjectIdentifier: string;
    sourceDirtyVersion: string;
    profileUsername: string;
    organizationCodes: string[];
    positionCodes: string[];
    clientCodes: string[];
    roleCodes: string[];
    responsibilityTypeCodes: string[];
    responsibilityTargetOrganizationCodes: string[];
  };
  subjectProfileReady: boolean;
  subjectProfileVersion: string;
}

export interface E2EScenarioOwner {
  establish: (
    input: E2EScenarioReferences & {
      adminPassword: string;
      internalApiKey: string;
    },
  ) => Promise<void>;
  readBack: (
    references: E2EScenarioReferences,
  ) => Promise<E2EScenarioReadBack>;
}

export interface SeedE2EScenarioInput {
  adminPassword: string;
  canonicalOrigin: string;
  owner: E2EScenarioOwner;
  random: { uuid: () => string };
  runId: string;
}

export async function seedE2EScenario(
  input: SeedE2EScenarioInput,
): Promise<E2EScenarioReferences> {
  const origin = requireCanonicalOrigin(input.canonicalOrigin);
  const identity = createE2EScenarioIdentity(input.runId);
  if (input.adminPassword.length < 12)
    throw new Error("E2E synthetic admin credential is too short");

  const references: E2EScenarioReferences = {
    version: 1,
    runId: input.runId,
    canonicalOrigin: origin,
    adminSubjectIdentifier: input.random.uuid(),
    ...identity,
    adminRedirectUri: `${origin}/iam-admin/*`,
    customSsoRedirectUri: `${origin}/e2e/custom-sso/*`,
    oidcRedirectUri: `${origin}/e2e/oidc/callback`,
    oidcPostLogoutRedirectUri: `${origin}/e2e/oidc/logged-out`,
  };

  await input.owner.establish({
    ...references,
    adminPassword: input.adminPassword,
    internalApiKey: createE2EScenarioInternalApiKey(input.runId),
  });
  assertScenarioReadBack(references, await input.owner.readBack(references));
  return references;
}

export function createE2EScenarioIdentity(runId: string): E2EScenarioIdentity {
  const runKey = requireRunKey(runId);
  return {
    adminUsername: `e2e-admin-${runKey}`,
    organizationCode: `e2e-org-${runKey}`,
    responsibilityTargetOrganizationCode: `e2e-resp-target-${runKey}`,
    positionCode: `e2e-pos-${runKey}`,
    responsibilityHolderPositionCode: `e2e-resp-pos-${runKey}`,
    adminRoleCode: `e2e-role-${runKey}`,
    adminClientCode: `e2e-admin-${runKey}`,
    customSsoClientCode: `e2e-custom-${runKey}`,
    internalClientCode: `e2e-internal-${runKey}`,
    oidcClientCode: `e2e-oidc-${runKey}`,
  };
}

export function createE2EScenarioInternalApiKey(runId: string) {
  return `iam-e2e-internal-api-key-${requireRunKey(runId)}`;
}

function requireCanonicalOrigin(value: string) {
  const url = new URL(value);
  if (
    url.origin !== value
    || url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.port === ""
    || url.username !== ""
    || url.password !== ""
  ) {
    throw new Error("E2E canonical origin must be http://127.0.0.1:<port>");
  }
  return value;
}

function requireRunKey(runId: string) {
  if (!/^[a-z0-9-]+$/u.test(runId))
    throw new Error("E2E run id must contain only lowercase letters, digits, and hyphens");
  return runId.slice(-18);
}

function assertScenarioReadBack(
  expected: E2EScenarioReferences,
  actual: E2EScenarioReadBack,
) {
  const matches = actual.admin.active
    && actual.admin.passwordConfigured
    && actual.admin.subjectIdentifier === expected.adminSubjectIdentifier
    && actual.admin.username === expected.adminUsername
    && actual.organization.active
    && actual.organization.code === expected.organizationCode
    && actual.responsibilityTargetOrganization.active
    && actual.responsibilityTargetOrganization.code
    === expected.responsibilityTargetOrganizationCode
    && actual.position.active
    && actual.position.code === expected.positionCode
    && actual.employment.active
    && actual.responsibilityHolderEmployment.active
    && actual.role.active
    && actual.role.assigned
    && actual.role.code === expected.adminRoleCode
    && actual.adminClient.active
    && actual.adminClient.customSsoEnabled
    && actual.adminClient.clientCode === expected.adminClientCode
    && actual.adminClient.mode === CustomSsoClientMode.Gateway
    && actual.adminClient.redirectUris.length === 1
    && actual.adminClient.redirectUris[0] === expected.adminRedirectUri
    && actual.customSsoClient.active
    && !actual.customSsoClient.customSsoEnabled
    && actual.customSsoClient.clientCode === expected.customSsoClientCode
    && actual.customSsoClient.mode === null
    && actual.customSsoClient.redirectUris.length === 0
    && actual.internalClient.active
    && actual.internalClient.clientCode === expected.internalClientCode
    && actual.oidcClient.active
    && actual.oidcClient.clientCode === expected.oidcClientCode
    && actual.oidcClient.clientType === OidcClientType.Public
    && actual.oidcClient.redirectUris.length === 1
    && actual.oidcClient.redirectUris[0] === expected.oidcRedirectUri
    && actual.subjectAccess === "enabled"
    && actual.subjectFacts.ready
    && actual.subjectFacts.subjectIdentifier === expected.adminSubjectIdentifier
    && actual.subjectFacts.sourceDirtyVersion === actual.subjectProfileVersion
    && actual.subjectFacts.profileUsername === expected.adminUsername
    && exactly(actual.subjectFacts.organizationCodes, expected.organizationCode)
    && exactlyAll(actual.subjectFacts.positionCodes, [
      expected.positionCode,
      expected.responsibilityHolderPositionCode,
    ])
    && exactly(actual.subjectFacts.clientCodes, expected.adminClientCode)
    && exactly(actual.subjectFacts.roleCodes, expected.adminRoleCode)
    && actual.subjectFacts.responsibilityTypeCodes.length === 0
    && actual.subjectFacts.responsibilityTargetOrganizationCodes.length === 0
    && actual.subjectProfileReady;
  if (!matches)
    throw new Error("E2E scenario owner read-back did not confirm the complete fixed scenario");
}

function exactly(values: string[], expected: string) {
  return values.length === 1 && values[0] === expected;
}

function exactlyAll(values: string[], expected: string[]) {
  const sortedExpected = [...expected].sort();
  return values.length === sortedExpected.length
    && [...values].sort().every((value, index) =>
      value === sortedExpected[index]);
}
