export interface E2EScenarioReferences {
  version: 1;
  runId: string;
  canonicalOrigin: string;
  internalOrigin?: string;
  adminSubjectIdentifier: string;
  adminUsername: string;
  hrAdminSubjectIdentifier: string;
  hrAdminUsername: string;
  hrAdminUpdatedName: string;
  delegateeSubjectIdentifier: string;
  delegateeUsername: string;
  pausedSubjectIdentifier: string;
  pausedUsername: string;
  disabledSubjectIdentifier: string;
  disabledUsername: string;
  noScopeHrAdminSubjectIdentifier: string;
  noScopeHrAdminUsername: string;
  smsBindingSubjectIdentifier: string;
  organizationCode: string;
  responsibilityHolderOrganizationCode: string;
  responsibilityTargetOrganizationCode: string;
  hrSecondScopeRootOrganizationCode: string;
  hrResponsibilityTargetOrganizationCode: string;
  positionCode: string;
  globalPositionCode: string;
  responsibilityHolderPositionCode: string;
  outsideResponsibilityHolderPositionCode: string;
  responsibilityHolderEmploymentId: number;
  outsideResponsibilityHolderEmploymentId: number;
  adminMixedRoleAssignmentId: number;
  hiddenResponsibilityAssignmentId: number;
  hrSecondScopeRoleAssignmentId: number;
  adminRoleCode: string;
  hrAdminRoleCode: string;
  adminClientCode: string;
  adminRedirectUri: string;
  customSsoClientCode: string;
  customSsoRedirectUri: string;
  internalClientCode: string;
  oidcClientCode: string;
  oidcRedirectUri: string;
  oidcPostLogoutRedirectUri: string;
}

export type E2EScenarioGeneratedReferences = Pick<
  E2EScenarioReferences,
  | "hiddenResponsibilityAssignmentId"
  | "adminMixedRoleAssignmentId"
  | "hrSecondScopeRoleAssignmentId"
  | "outsideResponsibilityHolderEmploymentId"
  | "responsibilityHolderEmploymentId"
>;

export type E2EScenarioSeedReferences = Omit<E2EScenarioReferences, keyof E2EScenarioGeneratedReferences>;

export type E2EScenarioIdentity = Pick<
  E2EScenarioReferences,
  | "adminUsername"
  | "hrAdminUsername"
  | "hrAdminUpdatedName"
  | "delegateeUsername"
  | "pausedUsername"
  | "disabledUsername"
  | "noScopeHrAdminUsername"
  | "organizationCode"
  | "responsibilityHolderOrganizationCode"
  | "responsibilityTargetOrganizationCode"
  | "hrSecondScopeRootOrganizationCode"
  | "hrResponsibilityTargetOrganizationCode"
  | "positionCode"
  | "globalPositionCode"
  | "responsibilityHolderPositionCode"
  | "outsideResponsibilityHolderPositionCode"
  | "adminRoleCode"
  | "hrAdminRoleCode"
  | "adminClientCode"
  | "customSsoClientCode"
  | "internalClientCode"
  | "oidcClientCode"
>;

export interface E2EScenarioOwner {
  establish: (
    input: E2EScenarioSeedReferences & {
      adminPassword: string;
      internalApiKey: string;
      gatewayApiKey: string;
    },
  ) => Promise<E2EScenarioGeneratedReferences>;
}

export interface SeedE2EScenarioInput {
  adminPassword: string;
  canonicalOrigin: string;
  internalOrigin?: string;
  owner: E2EScenarioOwner;
  random: { uuid: () => string };
  runId: string;
}

export async function seedE2EScenario(input: SeedE2EScenarioInput): Promise<E2EScenarioReferences> {
  const origin = requireEntryOrigin(input.canonicalOrigin, "external");
  const identity = createE2EScenarioIdentity(input.runId);
  if (input.adminPassword.length < 12) throw new Error("E2E synthetic admin credential is too short");

  const fixedReferences = {
    version: 1,
    runId: input.runId,
    canonicalOrigin: origin,
    internalOrigin: input.internalOrigin === undefined ? origin : requireEntryOrigin(input.internalOrigin, "internal"),
    adminSubjectIdentifier: input.random.uuid(),
    hrAdminSubjectIdentifier: input.random.uuid(),
    delegateeSubjectIdentifier: input.random.uuid(),
    pausedSubjectIdentifier: input.random.uuid(),
    disabledSubjectIdentifier: input.random.uuid(),
    noScopeHrAdminSubjectIdentifier: input.random.uuid(),
    smsBindingSubjectIdentifier: input.random.uuid(),
    ...identity,
    adminRedirectUri: `${origin}/iam-admin/*`,
    customSsoRedirectUri: `${origin}/e2e/custom-sso/*`,
    oidcRedirectUri: `${origin}/e2e/oidc/callback`,
    oidcPostLogoutRedirectUri: `${origin}/e2e/oidc/logged-out`,
  } satisfies E2EScenarioSeedReferences;

  const generatedReferences = await input.owner.establish({
    ...fixedReferences,
    adminPassword: input.adminPassword,
    internalApiKey: createE2EScenarioInternalApiKey(input.runId),
    gatewayApiKey: createE2EGatewayApiKey(input.runId),
  });
  return { ...fixedReferences, ...generatedReferences };
}

export function createE2EScenarioIdentity(runId: string): E2EScenarioIdentity {
  const runKey = requireRunKey(runId);
  return {
    adminUsername: `e2e-admin-${runKey}`,
    hrAdminUsername: `e2e-hr-admin-${runKey}`,
    hrAdminUpdatedName: `E2E HR Admin Updated ${runKey}`,
    delegateeUsername: `e2e-delegatee-${runKey}`,
    pausedUsername: `e2e-paused-${runKey}`,
    disabledUsername: `e2e-disabled-${runKey}`,
    noScopeHrAdminUsername: `e2e-no-scope-hr-${runKey}`,
    organizationCode: `e2e-org-${runKey}`,
    responsibilityHolderOrganizationCode: `e2e-holder-org-${runKey}`,
    responsibilityTargetOrganizationCode: `e2e-resp-target-${runKey}`,
    hrSecondScopeRootOrganizationCode: `e2e-hr-root-${runKey}`,
    hrResponsibilityTargetOrganizationCode: `e2e-hr-target-${runKey}`,
    positionCode: `e2e-pos-${runKey}`,
    globalPositionCode: `e2e-global-pos-${runKey}`,
    responsibilityHolderPositionCode: `e2e-resp-pos-${runKey}`,
    outsideResponsibilityHolderPositionCode: `e2e-outside-resp-pos-${runKey}`,
    adminRoleCode: "iam:admin",
    hrAdminRoleCode: "iam:hr-admin",
    adminClientCode: "iam-admin",
    customSsoClientCode: `e2e-custom-${runKey}`,
    internalClientCode: `e2e-internal-${runKey}`,
    oidcClientCode: `e2e-oidc-${runKey}`,
  };
}

export function createE2EGatewayApiKey(runId: string) {
  return `iam-e2e-gateway-api-key-${requireRunKey(runId)}`;
}

export function createE2EScenarioInternalApiKey(runId: string) {
  return `iam-e2e-internal-api-key-${requireRunKey(runId)}`;
}

export function createE2ESeedSubjects(
  references: E2EScenarioSeedReferences,
): Array<{ subjectIdentifier: string; state: "enabled" | "disabled" }> {
  return [
    { subjectIdentifier: references.adminSubjectIdentifier, state: "enabled" },
    { subjectIdentifier: references.hrAdminSubjectIdentifier, state: "enabled" },
    { subjectIdentifier: references.delegateeSubjectIdentifier, state: "enabled" },
    { subjectIdentifier: references.pausedSubjectIdentifier, state: "disabled" },
    { subjectIdentifier: references.disabledSubjectIdentifier, state: "disabled" },
    { subjectIdentifier: references.noScopeHrAdminSubjectIdentifier, state: "enabled" },
    { subjectIdentifier: references.smsBindingSubjectIdentifier, state: "enabled" },
  ];
}

function requireEntryOrigin(value: string, entry: "internal" | "external") {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== "http:" ||
    !["127.0.0.1", `${entry}.iam.localhost`].includes(url.hostname) ||
    url.port === "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error(`E2E ${entry} origin must use its loopback hostname and an explicit HTTP port`);
  }
  return value;
}

function requireRunKey(runId: string) {
  if (!/^[a-z0-9-]+$/u.test(runId))
    throw new Error("E2E run id must contain only lowercase letters, digits, and hyphens");
  return runId.slice(-18);
}
