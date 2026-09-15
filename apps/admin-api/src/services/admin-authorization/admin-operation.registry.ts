import type { AdminModuleCode } from "@iam/contracts";

interface AdminQueryOperationClassification {
  module: AdminModuleCode;
  type: "query";
  resourceType: string;
}

interface AdminMutationOperationClassification {
  module: AdminModuleCode;
  type: "mutation";
  resourceType: string;
  resourceIdentifier: (input: unknown) => string | number;
}

const maximumResourceIdentifierLength = 128;

function normalizePrimitiveIdentifier(value: string | number) {
  if (typeof value === "number" || value.length <= maximumResourceIdentifierLength)
    return value;
  return `${value.slice(0, maximumResourceIdentifierLength - 3)}...`;
}

type AdminOperationClassification
  = | AdminQueryOperationClassification
    | AdminMutationOperationClassification;

function findPrimitiveIdentifier(
  input: unknown,
  keys: readonly string[],
): string | number | undefined {
  const pending = [input];
  const visited = new Set<object>();
  const maximumInspectedObjects = 1_024;
  const maximumInspectedProperties = 1_024;
  let inspectedObjects = 0;
  let inspectedProperties = 0;
  let pendingIndex = 0;

  try {
    while (
      pendingIndex < pending.length
      && inspectedObjects < maximumInspectedObjects
    ) {
      const current = pending[pendingIndex];
      pendingIndex += 1;
      if (!current || typeof current !== "object" || visited.has(current))
        continue;
      visited.add(current);
      inspectedObjects += 1;

      const record = current as Record<string, unknown>;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" || typeof value === "number")
          return normalizePrimitiveIdentifier(value);
      }
      for (const property in record) {
        if (!Object.hasOwn(record, property))
          continue;
        inspectedProperties += 1;
        if (inspectedProperties > maximumInspectedProperties)
          return undefined;
        const value = record[property];
        if (value && typeof value === "object")
          pending.push(value);
      }
    }
  }
  catch {
    return undefined;
  }
  return undefined;
}

function identify(...keys: string[]) {
  return (input: unknown) =>
    findPrimitiveIdentifier(input, keys) ?? "collection";
}

function userMutation(keys: string[]) {
  return {
    module: "user",
    type: "mutation",
    resourceType: "user",
    resourceIdentifier: identify(...keys),
  } as const;
}
function organizationMutation(keys: string[]) {
  return {
    module: "organization",
    type: "mutation",
    resourceType: "organization",
    resourceIdentifier: identify(...keys),
  } as const;
}
function responsibilityMutation(keys: string[]) {
  return {
    module: "organizationResponsibility",
    type: "mutation",
    resourceType: "organizationResponsibilityAssignment",
    resourceIdentifier: identify(...keys),
  } as const;
}
function positionMutation(keys: string[]) {
  return {
    module: "position",
    type: "mutation",
    resourceType: "position",
    resourceIdentifier: identify(...keys),
  } as const;
}
function employmentMutation(keys: string[]) {
  return {
    module: "employment",
    type: "mutation",
    resourceType: "employment",
    resourceIdentifier: identify(...keys),
  } as const;
}
function clientMutation(keys: string[]) {
  return {
    module: "client",
    type: "mutation",
    resourceType: "client",
    resourceIdentifier: identify(...keys),
  } as const;
}
function roleMutation(keys: string[]) {
  return {
    module: "role",
    type: "mutation",
    resourceType: "role",
    resourceIdentifier: identify(...keys),
  } as const;
}
function roleAssignmentMutation(keys: string[]) {
  return {
    module: "role",
    type: "mutation",
    resourceType: "roleAssignment",
    resourceIdentifier: identify(...keys),
  } as const;
}

export const ADMIN_OPERATION_REGISTRY = {
  "admin.authorization.capabilitySummary": { module: "user", type: "query", resourceType: "adminCapability" },
  "admin.audit.search": { module: "audit", type: "query", resourceType: "auditLog" },

  "admin.client.search": { module: "client", type: "query", resourceType: "client" },
  "admin.client.detail": { module: "client", type: "query", resourceType: "client" },
  "admin.client.create": clientMutation(["clientCode"]),
  "admin.client.update": clientMutation(["clientCode"]),
  "admin.client.updateLegacy": clientMutation(["clientCode", "id"]),
  "admin.client.updateStatus": clientMutation(["clientCode"]),
  "admin.client.delete": clientMutation(["clientCode"]),
  "admin.clientSso.delete": clientMutation(["clientCode"]),
  "admin.clientSso.detail": { module: "client", type: "query", resourceType: "client" },
  "admin.clientSso.save": clientMutation(["clientCode"]),
  "admin.clientSso.selectProtocol": clientMutation(["clientCode"]),
  "admin.clientSso.setEnabled": clientMutation(["clientCode"]),
  "admin.clientSso.rotateSecret": clientMutation(["clientCode"]),
  "admin.clientSso.readSecret": clientMutation(["clientCode"]),

  "admin.employment.search": { module: "employment", type: "query", resourceType: "employment" },
  "admin.employment.detail": { module: "employment", type: "query", resourceType: "employment" },
  "admin.employment.create": employmentMutation(["username"]),
  "admin.employment.update": employmentMutation(["id"]),
  "admin.employment.pause": employmentMutation(["id"]),
  "admin.employment.resume": employmentMutation(["id"]),
  "admin.employment.end": employmentMutation(["id"]),
  "admin.employment.transfer": employmentMutation(["id"]),
  "admin.employment.setPrimary": employmentMutation(["id"]),
  "admin.employment.clearPrimary": employmentMutation(["id"]),
  "admin.employment.resignUser": userMutation(["username"]),

  "admin.organization.search": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.children": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.selector": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.detail": { module: "organization", type: "query", resourceType: "organization" },
  "admin.organization.create": organizationMutation(["orgCode", "parentOrgCode"]),
  "admin.organization.update": organizationMutation(["orgCode"]),
  "admin.organization.updateStatus": organizationMutation(["orgCode"]),
  "admin.organization.delete": organizationMutation(["orgCode"]),

  "admin.organizationResponsibility.listTypes": { module: "organizationResponsibility", type: "query", resourceType: "organizationResponsibilityType" },
  "admin.organizationResponsibility.listAssignments": { module: "organizationResponsibility", type: "query", resourceType: "organizationResponsibilityAssignment" },
  "admin.organizationResponsibility.searchAssignments": { module: "organizationResponsibility", type: "query", resourceType: "organizationResponsibilityAssignment" },
  "admin.organizationResponsibility.detailAssignment": { module: "organizationResponsibility", type: "query", resourceType: "organizationResponsibilityAssignment" },
  "admin.organizationResponsibility.scopedDetailAssignment": { module: "organizationResponsibility", type: "query", resourceType: "organizationResponsibilityAssignment" },
  "admin.organizationResponsibility.createAssignment": {
    module: "organizationResponsibility",
    type: "mutation",
    resourceType: "organizationResponsibilityAssignment",
    resourceIdentifier: () => "create-request",
  },
  "admin.organizationResponsibility.pauseAssignment": responsibilityMutation(["id"]),
  "admin.organizationResponsibility.resumeAssignment": responsibilityMutation(["id"]),
  "admin.organizationResponsibility.endAssignment": responsibilityMutation(["id"]),

  "admin.position.search": { module: "position", type: "query", resourceType: "position" },
  "admin.position.detail": { module: "position", type: "query", resourceType: "position" },
  "admin.position.create": positionMutation(["posCode"]),
  "admin.position.update": positionMutation(["posCode"]),
  "admin.position.updateStatus": positionMutation(["posCode"]),
  "admin.position.delete": positionMutation(["posCode"]),

  "admin.role.search": { module: "role", type: "query", resourceType: "role" },
  "admin.role.detail": { module: "role", type: "query", resourceType: "role" },
  "admin.role.create": roleMutation(["roleCode"]),
  "admin.role.update": roleMutation(["roleCode"]),
  "admin.role.updateStatus": roleMutation(["roleCode"]),
  "admin.role.delete": roleMutation(["roleCode"]),
  "admin.role.assignments.search": { module: "role", type: "query", resourceType: "roleAssignment" },
  "admin.role.assignments.create": roleAssignmentMutation(["roleCode"]),
  "admin.role.assignments.updateScope": roleAssignmentMutation(["assignmentId", "roleCode"]),
  "admin.role.assignments.delete": roleAssignmentMutation(["assignmentId", "roleCode"]),

  "admin.sessionManagement.listLoginRestrictions": { module: "sessionManagement", type: "query", resourceType: "loginRestriction" },
  "admin.sessionManagement.listSessions": { module: "sessionManagement", type: "query", resourceType: "session" },
  "admin.sessionManagement.releaseLoginRestriction": {
    module: "sessionManagement",
    type: "mutation",
    resourceType: "loginRestriction",
    resourceIdentifier: identify("userId"),
  },
  "admin.sessionManagement.revokeSessions": {
    module: "sessionManagement",
    type: "mutation",
    resourceType: "session",
    resourceIdentifier: identify("principalSessionId", "userId", "clientCode"),
  },

  "admin.user.search": { module: "user", type: "query", resourceType: "user" },
  "admin.user.detail": { module: "user", type: "query", resourceType: "user" },
  "admin.user.generatePassword": { module: "user", type: "query", resourceType: "passwordCandidate" },
  "admin.user.create": userMutation(["username"]),
  "admin.user.update": userMutation(["username"]),
  "admin.user.updateStatus": userMutation(["username"]),
  "admin.user.delete": userMutation(["username"]),
  "admin.user.resetPassword": userMutation(["username"]),
} as const satisfies Record<string, AdminOperationClassification>;

export const ADMIN_AUTHORIZATION_OPERATION_REGISTRY = ADMIN_OPERATION_REGISTRY;
export type AdminOperationId = keyof typeof ADMIN_AUTHORIZATION_OPERATION_REGISTRY;

export const ADMIN_REST_ONLY_OPERATION_IDS = [
  "admin.client.updateLegacy",
  "admin.organizationResponsibility.scopedDetailAssignment",
] as const satisfies readonly AdminOperationId[];
