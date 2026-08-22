import type { Employment, Organization } from "@iam/db/schema";
import type {
  UserProfileBuildDataset,
  UserProfileBuildOrgPathRow,
  UserProfileBuildPosition,
  UserProfileBuildPrivilegeRow,
  UserProfileBuildRoleRow,
} from "./user-profile-build.repository";
import {
  EmploymentStatus,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
} from "@iam/contracts";
import {
  EmploymentDetailDtoSchema,
  OPEN_EMPLOYMENT_STATUSES,
  toEmploymentDto,
} from "@iam/domain/employment";
import { UserDetailDtoSchema } from "@iam/domain/user";
import {
  compareCodes,
  groupItemsBy,
} from "./user-profile-build.helpers";

export type UserProfileEmploymentIntegrityFailureReason
  = | "organization-not-effective"
    | "position-not-effective";

export class UserProfileEmploymentIntegrityError extends Error {
  readonly code = "USER_PROFILE_EMPLOYMENT_INTEGRITY_FAILED";

  constructor(
    readonly userId: number,
    readonly employmentId: number,
    readonly reason: UserProfileEmploymentIntegrityFailureReason,
  ) {
    super(`User Profile Employment integrity failed: ${reason}`);
    this.name = "UserProfileEmploymentIntegrityError";
  }
}

type EmploymentOrgNode = Pick<
  Organization,
  | "id"
  | "orgCode"
  | "orgName"
  | "orgType"
  | "level"
  | "parentId"
  | "isVirtual"
  | "isEntity"
  | "status"
  | "isDelete"
> & {
  pathIndex: number;
  distanceToAssignedOrg: number;
};

const OPEN_EMPLOYMENT_STATUS_SET = new Set<EmploymentStatus>(OPEN_EMPLOYMENT_STATUSES);

export function buildProfileDocumentsFromDataset(
  dataset: UserProfileBuildDataset,
  rebuiltAt: Date,
  targetsByUserId: ReadonlyMap<number, string>,
) {
  const employmentRowsByUserId = groupItemsBy(dataset.employments, row => row.userId);
  const positionById = new Map(dataset.positions.map(position => [position.id, position]));
  const orgPathByOrgId = buildOrgPathMap(dataset.orgPathRows);
  const roleRowsByEmploymentId = groupItemsBy(dataset.roleRows, row => row.employmentId);
  const privilegesByRoleId = groupItemsBy(dataset.privilegeRows, row => row.roleId);

  return dataset.users.map((user) => {
    const sourceDirtyVersion = targetsByUserId.get(user.id);
    if (sourceDirtyVersion === undefined)
      throw new Error(`User Profile build returned unexpected user ${user.id}`);
    const employmentRows = employmentRowsByUserId.get(user.id) ?? [];
    assertOpenEmploymentIntegrity({
      userId: user.id,
      employments: employmentRows,
      positionById,
      orgPathByOrgId,
    });
    const employmentDetails = employmentRows
      .filter(employment => employment.status === EmploymentStatus.Enable && !employment.isDelete)
      .map((employment) => {
        const position = positionById.get(employment.posId);
        const fullOrgPath = orgPathByOrgId.get(employment.orgId) ?? [];
        const assignedOrg = fullOrgPath.find(node => node.id === employment.orgId);
        if (position === undefined || assignedOrg === undefined)
          return null;

        const roleRows = roleRowsByEmploymentId.get(employment.id) ?? [];
        const roles = unique(roleRows.map(row => row.roleCode));
        const roleIds = roleRows.map(row => row.roleId);
        const privileges = unique(roleIds.flatMap(roleId =>
          (privilegesByRoleId.get(roleId) ?? []).map(row => row.privilegeCode),
        ));
        const organization = {
          assignedOrg,
          fullOrgPath,
          companyNodes: fullOrgPath.filter(node => node.orgType === OrganizationType.Company),
        };

        return {
          employment,
          organization,
          position,
          roleRows,
          roles,
          privileges,
          dto: EmploymentDetailDtoSchema.parse({
            ...toEmploymentDto({
              ...employment,
              user,
              organization,
              position,
            }),
            roles,
            privileges,
          }),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const detail = UserDetailDtoSchema.parse({
      ...user,
      employments: employmentDetails.map(item => item.dto),
      roles: unique(employmentDetails.flatMap(item => item.roles)),
      privileges: unique(employmentDetails.flatMap(item => item.privileges)),
    });
    const searchDoc = {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        mobile: user.mobile,
        wxId: user.wxId,
        userType: user.userType,
        status: user.status,
      },
      employments: employmentDetails.map(item => toSearchEmploymentDoc(item)),
    };
    const subjectFactsEmploymentItems = employmentDetails
      .filter(item => isEffectiveEmployment(item.employment, rebuiltAt))
      .map(item => ({
        employmentId: item.employment.id,
        facts: toSubjectFactsEmployment(item, privilegesByRoleId),
      }))
      .sort((left, right) => compareSubjectFactsEmployments(left.facts, right.facts));

    return {
      profile: {
        userId: user.id,
        subjectIdentifier: user.subjectIdentifier,
        username: user.username,
        name: user.name,
        mobile: user.mobile,
        wxId: user.wxId,
        status: user.status,
        isDelete: user.isDelete,
        searchVisible: user.status === UserStatus.Enable && !user.isDelete,
        sourceDirtyVersion,
        detail,
        searchDoc,
        subjectFacts: {
          employments: subjectFactsEmploymentItems.map(item => item.facts),
        },
        rebuiltAt,
      },
      subjectFactsEmploymentIds: subjectFactsEmploymentItems.map(item => item.employmentId),
    };
  });
}

export type BuiltProfileDocuments = ReturnType<
  typeof buildProfileDocumentsFromDataset
>[number];

function assertOpenEmploymentIntegrity(input: {
  userId: number;
  employments: Employment[];
  positionById: ReadonlyMap<number, UserProfileBuildPosition>;
  orgPathByOrgId: ReadonlyMap<number, EmploymentOrgNode[]>;
}) {
  for (const employment of input.employments) {
    if (!isOpenEmployment(employment))
      continue;

    const position = input.positionById.get(employment.posId);
    if (position === undefined || position.status !== PositionStatus.Enable || position.isDelete) {
      throw new UserProfileEmploymentIntegrityError(
        input.userId,
        employment.id,
        "position-not-effective",
      );
    }

    const assignedOrganization = input.orgPathByOrgId
      .get(employment.orgId)
      ?.find(node => node.id === employment.orgId);
    if (
      assignedOrganization === undefined
      || assignedOrganization.status !== OrganizationStatus.Enable
      || assignedOrganization.isDelete
    ) {
      throw new UserProfileEmploymentIntegrityError(
        input.userId,
        employment.id,
        "organization-not-effective",
      );
    }
  }
}

function isOpenEmployment(employment: Employment) {
  return !employment.isDelete
    && OPEN_EMPLOYMENT_STATUS_SET.has(employment.status);
}

function isEffectiveEmployment(employment: Employment, now: Date) {
  return employment.status === EmploymentStatus.Enable
    && !employment.isDelete
    && employment.startTime.getTime() <= now.getTime()
    && (employment.endTime === null || now.getTime() < employment.endTime.getTime());
}

function toSubjectFactsEmployment(
  input: {
    employment: Employment;
    organization: {
      assignedOrg: EmploymentOrgNode;
      fullOrgPath: EmploymentOrgNode[];
    };
    position: UserProfileBuildPosition;
    roleRows: UserProfileBuildRoleRow[];
  },
  privilegesByRoleId: Map<number, UserProfileBuildPrivilegeRow[]>,
) {
  return {
    isPrimary: input.employment.isPrimary,
    organization: {
      code: input.organization.assignedOrg.orgCode,
      name: input.organization.assignedOrg.orgName,
      type: input.organization.assignedOrg.orgType,
      path: input.organization.fullOrgPath.map(node => ({
        code: node.orgCode,
        name: node.orgName,
        type: node.orgType,
      })),
    },
    position: {
      code: input.position.posCode,
      name: input.position.posName,
    },
    clientAuthorizations: [...groupItemsBy(input.roleRows, role => role.clientCode)]
      .sort(([left], [right]) => compareCodes(left, right))
      .map(([clientCode, roles]) => ({
        clientCode,
        roles: [...new Map(roles.map(role => [role.roleCode, role])).values()]
          .sort((left, right) => compareCodes(left.roleCode, right.roleCode))
          .map(role => ({
            code: role.roleCode,
            privileges: unique(
              (privilegesByRoleId.get(role.roleId) ?? []).map(row => row.privilegeCode),
            ).sort(compareCodes),
          })),
      })),
  };
}

function compareSubjectFactsEmployments(
  left: ReturnType<typeof toSubjectFactsEmployment>,
  right: ReturnType<typeof toSubjectFactsEmployment>,
) {
  if (left.isPrimary !== right.isPrimary)
    return left.isPrimary ? -1 : 1;
  return compareCodes(left.organization.code, right.organization.code)
    || compareCodes(left.position.code, right.position.code);
}

function toSearchEmploymentDoc(input: {
  employment: Employment;
  organization: {
    assignedOrg: EmploymentOrgNode;
    fullOrgPath: EmploymentOrgNode[];
    companyNodes: EmploymentOrgNode[];
  };
  position: UserProfileBuildPosition;
  roles: string[];
  privileges: string[];
}) {
  const ancestorCodes = input.organization.fullOrgPath.map(node => node.orgCode);
  const ancestorDepths = input.organization.fullOrgPath.map(node => node.distanceToAssignedOrg);
  const ancestorKeys = input.organization.fullOrgPath.map(node =>
    buildAncestorKey(node.orgCode, node.distanceToAssignedOrg),
  );

  return {
    id: input.employment.id,
    org: {
      id: input.organization.assignedOrg.id,
      code: input.organization.assignedOrg.orgCode,
      ancestorCodes,
      ancestorDepths,
      ancestorKeys,
      companyCodes: input.organization.companyNodes.map(node => node.orgCode),
    },
    position: {
      id: input.position.id,
      code: input.position.posCode,
    },
    roles: input.roles,
    privileges: input.privileges,
    isPrimary: input.employment.isPrimary,
  };
}

function buildOrgPathMap(rows: UserProfileBuildOrgPathRow[]) {
  const map = groupItemsBy(rows, row => row.descendantId);
  const output = new Map<number, EmploymentOrgNode[]>();
  for (const [orgId, path] of map) {
    output.set(
      orgId,
      path
        .sort((a, b) => b.depth - a.depth || a.id - b.id)
        .map(({ descendantId: _descendantId, depth, ...org }, pathIndex) => ({
          ...org,
          pathIndex,
          distanceToAssignedOrg: depth,
        })),
    );
  }
  return output;
}

function buildAncestorKey(code: string, depth: number) {
  return `${code}#${depth}`;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
