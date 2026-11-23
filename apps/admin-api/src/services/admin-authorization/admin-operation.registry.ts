import type { AdminModuleCode } from "@iam/contracts";

export interface AdminOperationInput {
  operationInput: unknown;
  operationInputSource?: "rest-request";
}

interface AdminQueryOperationClassification {
  module: AdminModuleCode;
  type: "query";
  resourceType: string;
}

interface AdminMutationOperationClassification {
  module: AdminModuleCode;
  type: "mutation";
  resourceType: string;
  resourceIdentifier: (input: AdminOperationInput) => string | number;
}

const maximumResourceIdentifierLength = 128;

function normalizePrimitiveIdentifier(value: string | number) {
  if (typeof value === "number" || value.length <= maximumResourceIdentifierLength) return value;
  return `${value.slice(0, maximumResourceIdentifierLength - 3)}...`;
}

type AdminOperationClassification = AdminQueryOperationClassification | AdminMutationOperationClassification;

type RestIdentifierLocation = "params" | "body";

function readOwnProperty(input: unknown, key: string): unknown {
  try {
    if (input && typeof input === "object" && Object.hasOwn(input, key)) {
      return (input as Record<string, unknown>)[key];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readResourceInput(
  { operationInput, operationInputSource }: AdminOperationInput,
  restLocation: RestIdentifierLocation,
) {
  return operationInputSource === "rest-request" ? readOwnProperty(operationInput, restLocation) : operationInput;
}

function readResourceIdentifier(input: unknown, keys: readonly string[]) {
  for (const key of keys) {
    const value = readOwnProperty(input, key);
    if (typeof value === "string" || typeof value === "number") return normalizePrimitiveIdentifier(value);
  }
  return "collection";
}

function identifySessionRevocation(input: AdminOperationInput) {
  const target = readOwnProperty(readResourceInput(input, "body"), "target");
  switch (readOwnProperty(target, "type")) {
    case "session":
      return readResourceIdentifier(target, ["principalSessionId"]);
    case "user":
      return readResourceIdentifier(target, ["userId"]);
    default:
      return "collection";
  }
}

function mutationFor(module: AdminModuleCode, resourceType: string = module) {
  return (restLocation: RestIdentifierLocation, ...keys: string[]): AdminMutationOperationClassification => ({
    module,
    type: "mutation",
    resourceType,
    resourceIdentifier: (input) => readResourceIdentifier(readResourceInput(input, restLocation), keys),
  });
}

const clientMutation = mutationFor("client");
const definitionMutation = mutationFor("user", "custom_attribute_definition");
const delegationMutation = mutationFor("delegation");
const employmentMutation = mutationFor("employment");
const loginRestrictionMutation = mutationFor("sessionManagement", "loginRestriction");
const organizationMutation = mutationFor("organization");
const positionMutation = mutationFor("position");
const responsibilityMutation = mutationFor("organizationResponsibility", "organizationResponsibilityAssignment");
const roleAssignmentMutation = mutationFor("role", "roleAssignment");
const roleMutation = mutationFor("role");
const userMutation = mutationFor("user");

export const ADMIN_OPERATION_REGISTRY = {
  "admin.delegation.search": { module: "delegation", type: "query", resourceType: "delegation" },
  "admin.delegation.create": delegationMutation("body", "delegatorUsername"),
  "admin.delegation.update": delegationMutation("params", "id"),
  "admin.delegation.selectUsers": { module: "delegation", type: "query", resourceType: "delegationUserOption" },
  "admin.delegation.selectClients": { module: "delegation", type: "query", resourceType: "delegationClientOption" },
  "admin.delegation.selectOrganizations": {
    module: "delegation",
    type: "query",
    resourceType: "delegationOrganizationOption",
  },
  "admin.authorization.capabilitySummary": { module: "user", type: "query", resourceType: "adminCapability" },
  "admin.audit.search": { module: "audit", type: "query", resourceType: "auditLog" },

  "admin.client.search": { module: "client", type: "query", resourceType: "client" },
  "admin.client.detail": { module: "client", type: "query", resourceType: "client" },
  "admin.client.create": clientMutation("body", "clientCode"),
  "admin.client.update": clientMutation("params", "clientCode"),
  "admin.client.updateLegacy": clientMutation("body", "clientCode", "id"),
  "admin.client.updateStatus": clientMutation("params", "clientCode"),
  "admin.client.delete": clientMutation("params", "clientCode"),
  "admin.clientAdmission.preview": { module: "client", type: "query", resourceType: "client" },
  "admin.clientAdmission.save": clientMutation("params", "clientCode"),
  "admin.clientAdmission.setEnabled": clientMutation("params", "clientCode"),
  "admin.clientAdmission.detail": { module: "client", type: "query", resourceType: "client" },
  "admin.clientSso.delete": clientMutation("params", "clientCode"),
  "admin.clientSso.detail": { module: "client", type: "query", resourceType: "client" },
  "admin.clientSso.save": clientMutation("params", "clientCode"),
  "admin.clientSso.selectProtocol": clientMutation("params", "clientCode"),
  "admin.clientSso.setEnabled": clientMutation("params", "clientCode"),
  "admin.clientSso.rotateSecret": clientMutation("params", "clientCode"),
  "admin.clientSso.readSecret": clientMutation("params", "clientCode"),

  "admin.employment.search": { module: "employment", type: "query", resourceType: "employment" },
  "admin.employment.detail": { module: "employment", type: "query", resourceType: "employment" },
  "admin.employment.create": employmentMutation("body", "username"),
  "admin.employment.update": employmentMutation("params", "id"),
  "admin.employment.pause": employmentMutation("params", "id"),
  "admin.employment.resume": employmentMutation("params", "id"),
  "admin.employment.end": employmentMutation("params", "id"),
  "admin.employment.transfer": employmentMutation("params", "id"),
  "admin.employment.setPrimary": employmentMutation("params", "id"),
  "admin.employment.clearPrimary": employmentMutation("params", "id"),
  "admin.employment.resignUser": userMutation("params", "username"),

  "admin.organization.search": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.children": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.selector": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.detail": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.create": organizationMutation("body", "orgCode"),
  "admin.organization.update": organizationMutation("params", "orgCode"),
  "admin.organization.updateStatus": organizationMutation("params", "orgCode"),
  "admin.organization.delete": organizationMutation("params", "orgCode"),

  "admin.organizationResponsibility.listTypes": {
    module: "organizationResponsibility",
    type: "query",
    resourceType: "organizationResponsibilityType",
  },
  "admin.organizationResponsibility.listAssignments": {
    module: "organizationResponsibility",
    type: "query",
    resourceType: "organizationResponsibilityAssignment",
  },
  "admin.organizationResponsibility.searchAssignments": {
    module: "organizationResponsibility",
    type: "query",
    resourceType: "organizationResponsibilityAssignment",
  },
  "admin.organizationResponsibility.detailAssignment": {
    module: "organizationResponsibility",
    type: "query",
    resourceType: "organizationResponsibilityAssignment",
  },
  "admin.organizationResponsibility.scopedDetailAssignment": {
    module: "organizationResponsibility",
    type: "query",
    resourceType: "organizationResponsibilityAssignment",
  },
  "admin.organizationResponsibility.createAssignment": {
    module: "organizationResponsibility",
    type: "mutation",
    resourceType: "organizationResponsibilityAssignment",
    resourceIdentifier: () => "create-request",
  },
  "admin.organizationResponsibility.pauseAssignment": responsibilityMutation("params", "id"),
  "admin.organizationResponsibility.resumeAssignment": responsibilityMutation("params", "id"),
  "admin.organizationResponsibility.endAssignment": responsibilityMutation("params", "id"),

  "admin.position.search": { module: "position", type: "query", resourceType: "position" },
  "admin.position.detail": { module: "position", type: "query", resourceType: "position" },
  "admin.position.create": positionMutation("body", "posCode"),
  "admin.position.update": positionMutation("params", "posCode"),
  "admin.position.updateStatus": positionMutation("params", "posCode"),
  "admin.position.delete": positionMutation("params", "posCode"),

  "admin.role.search": { module: "role", type: "query", resourceType: "role" },
  "admin.role.detail": { module: "role", type: "query", resourceType: "role" },
  "admin.role.create": roleMutation("body", "roleCode"),
  "admin.role.update": roleMutation("params", "roleCode"),
  "admin.role.updateStatus": roleMutation("params", "roleCode"),
  "admin.role.delete": roleMutation("params", "roleCode"),
  "admin.role.assignments.search": { module: "role", type: "query", resourceType: "roleAssignment" },
  "admin.role.assignments.create": roleAssignmentMutation("params", "roleCode"),
  "admin.role.assignments.updateScope": roleAssignmentMutation("params", "assignmentId", "roleCode"),
  "admin.role.assignments.delete": roleAssignmentMutation("params", "assignmentId", "roleCode"),

  "admin.sessionManagement.listLoginRestrictions": {
    module: "sessionManagement",
    type: "query",
    resourceType: "loginRestriction",
  },
  "admin.sessionManagement.listSessions": { module: "sessionManagement", type: "query", resourceType: "session" },
  "admin.sessionManagement.releaseLoginRestriction": loginRestrictionMutation("params", "userId"),
  "admin.sessionManagement.revokeSessions": {
    module: "sessionManagement",
    type: "mutation",
    resourceType: "session",
    resourceIdentifier: identifySessionRevocation,
  },

  "admin.customAttribute.list": { module: "user", type: "query", resourceType: "custom_attribute_definition" },
  "admin.customAttribute.create": definitionMutation("body", "code"),
  "admin.customAttribute.update": definitionMutation("body", "code"),
  "admin.customAttribute.setEnabled": definitionMutation("body", "code"),

  "admin.user.search": { module: "user", type: "query", resourceType: "user" },
  "admin.user.detail": { module: "user", type: "query", resourceType: "user" },
  "admin.user.generatePassword": { module: "user", type: "query", resourceType: "passwordCandidate" },
  "admin.user.create": userMutation("body", "username"),
  "admin.user.update": userMutation("params", "username"),
  "admin.user.updateStatus": userMutation("params", "username"),
  "admin.user.delete": userMutation("params", "username"),
  "admin.user.resetPassword": userMutation("params", "username"),
  "admin.user.unlinkWecom": userMutation("params", "username"),
  "admin.user.unlinkWecomExternalBinding": userMutation("params", "username"),
} as const satisfies Record<string, AdminOperationClassification>;

export const ADMIN_AUTHORIZATION_OPERATION_REGISTRY = ADMIN_OPERATION_REGISTRY;
export type AdminOperationId = keyof typeof ADMIN_AUTHORIZATION_OPERATION_REGISTRY;

export const ADMIN_REST_ONLY_OPERATION_IDS = [
  "admin.client.updateLegacy",
  "admin.organizationResponsibility.scopedDetailAssignment",
] as const satisfies readonly AdminOperationId[];
