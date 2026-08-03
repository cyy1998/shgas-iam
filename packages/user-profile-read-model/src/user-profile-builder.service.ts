import type { Employment, Organization } from "@iam/db/schema";
import type {
  UserProfileBuildDataset,
  UserProfileBuildOrgPathRow,
  UserProfileBuildPosition,
  UserProfileBuildPrivilegeRow,
  UserProfileBuildRepository,
  UserProfileBuildRoleRow,
} from "./user-profile-build.repository";
import type {
  PublishedUserProfile,
  SubjectFactsDocumentV1,
} from "./user-profile.schema";
import {
  EmploymentStatus,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
} from "@iam/contracts";
import { formatDirtyVersion } from "./dirty-version";
import {
  buildAncestorKey,
  CURRENT_USER_PROFILE_SCHEMA_VERSION,
  EmploymentDetailDtoSchema,
  SubjectFactsDocumentV1Schema,
  toEmploymentDto,
  UserDetailDtoSchema,
  UserProfileSearchDocSchema,
} from "./user-profile.schema";

export interface UserProfileBuilderDeps {
  buildRepository: UserProfileBuildRepository;
  clock: {
    nowDate: () => Date;
  };
  config: {
    batchSize: number;
  };
}

export type BuiltUserProfile = PublishedUserProfile;

export interface UserProfileBuildTarget {
  userId: number;
  sourceDirtyVersion: string;
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

export function createUserProfileBuilder(deps: UserProfileBuilderDeps) {
  async function buildOne(target: UserProfileBuildTarget) {
    return (await buildMany([target]))[0] ?? null;
  }

  async function buildMany(targets: UserProfileBuildTarget[]) {
    const targetsByUserId = normalizeBuildTargets(targets);
    const profiles: BuiltUserProfile[] = [];
    for (const chunk of chunks([...targetsByUserId.keys()], deps.config.batchSize)) {
      const dataset = await deps.buildRepository.loadByUserIds(chunk);
      profiles.push(...buildFromDataset(dataset, deps.clock.nowDate(), targetsByUserId));
    }
    return profiles;
  }

  return {
    buildOne,
    buildMany,
  };
}

export type UserProfileBuilder = ReturnType<typeof createUserProfileBuilder>;

function buildFromDataset(
  dataset: UserProfileBuildDataset,
  rebuiltAt: Date,
  targetsByUserId: ReadonlyMap<number, string>,
): BuiltUserProfile[] {
  const employmentRowsByUserId = groupBy(dataset.employments, row => row.userId);
  const positionById = new Map(dataset.positions.map(position => [position.id, position]));
  const orgPathByOrgId = buildOrgPathMap(dataset.orgPathRows);
  const roleRowsByEmploymentId = groupBy(dataset.roleRows, row => row.employmentId);
  const privilegesByRoleId = groupBy(dataset.privilegeRows, row => row.roleId);

  return dataset.users.map((user) => {
    const sourceDirtyVersion = targetsByUserId.get(user.id);
    if (sourceDirtyVersion === undefined)
      throw new Error(`User Profile build returned unexpected user ${user.id}`);
    const employmentDetails = (employmentRowsByUserId.get(user.id) ?? [])
      .map((employment) => {
        const position = positionById.get(employment.posId);
        const fullOrgPath = orgPathByOrgId.get(employment.orgId) ?? [];
        const assignedOrg = fullOrgPath.find(node => node.id === employment.orgId);
        if (position === undefined || assignedOrg === undefined) {
          return null;
        }

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
    const searchDoc = UserProfileSearchDocSchema.parse({
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
    });
    const subjectFacts = SubjectFactsDocumentV1Schema.parse({
      employments: employmentDetails
        .filter(isCurrentSubjectFactsEmployment)
        .map(item => toSubjectFactsEmployment(item, privilegesByRoleId))
        .sort(compareSubjectFactsEmployments),
    });

    return {
      userId: user.id,
      subjectIdentifier: user.subjectIdentifier,
      username: user.username,
      name: user.name,
      mobile: user.mobile,
      wxId: user.wxId,
      status: user.status,
      isDelete: user.isDelete,
      searchVisible: user.status === UserStatus.Enable && !user.isDelete,
      profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
      sourceDirtyVersion,
      detail,
      searchDoc,
      subjectFacts,
      rebuiltAt,
    };
  });
}

function isCurrentSubjectFactsEmployment(input: {
  employment: Employment;
  organization: {
    assignedOrg: EmploymentOrgNode;
  };
  position: UserProfileBuildPosition;
}) {
  return input.employment.status === EmploymentStatus.Enable
    && !input.employment.isDelete
    && input.position.status === PositionStatus.Enable
    && !input.position.isDelete
    && input.organization.assignedOrg.status === OrganizationStatus.Enable
    && !input.organization.assignedOrg.isDelete;
}

function normalizeBuildTargets(targets: UserProfileBuildTarget[]) {
  const result = new Map<number, string>();
  for (const target of targets) {
    const sourceDirtyVersion = formatDirtyVersion(target.sourceDirtyVersion);
    const existingVersion = result.get(target.userId);
    if (existingVersion !== undefined && existingVersion !== sourceDirtyVersion) {
      throw new Error(`User Profile ${target.userId} cannot be built for multiple Dirty Versions`);
    }
    result.set(target.userId, sourceDirtyVersion);
  }
  return result;
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
    clientAuthorizations: [...groupBy(input.roleRows, role => role.clientCode)]
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
  left: SubjectFactsDocumentV1["employments"][number],
  right: SubjectFactsDocumentV1["employments"][number],
) {
  if (left.isPrimary !== right.isPrimary)
    return left.isPrimary ? -1 : 1;
  return compareCodes(left.organization.code, right.organization.code)
    || compareCodes(left.position.code, right.position.code);
}

function compareCodes(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
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
  const map = groupBy(rows, row => row.descendantId);
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

function groupBy<T, K>(items: T[], keyFn: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
