import type { Employment, Organization } from "@iam/db/schema";
import type {
  UserProfileBuildDataset,
  UserProfileBuildOrgPathRow,
  UserProfileBuildPosition,
  UserProfileBuildRepository,
} from "./user-profile-build.repository";
import type { UserDetailDto, UserProfileSearchDoc } from "./user-profile.schema";
import { OrganizationType, UserStatus } from "@iam/contracts";
import {
  buildAncestorKey,
  CURRENT_USER_PROFILE_SCHEMA_VERSION,
  EmploymentDetailDtoSchema,
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

export interface BuiltUserProfile {
  userId: number;
  username: string;
  mobile: string | null;
  wxId: string | null;
  status: UserStatus;
  isDelete: boolean;
  searchVisible: boolean;
  profileSchemaVersion: number;
  detail: UserDetailDto;
  searchDoc: UserProfileSearchDoc;
  rebuiltAt: Date;
}

type EmploymentOrgNode = Pick<
  Organization,
  "id" | "orgCode" | "orgName" | "orgType" | "level" | "parentId" | "isVirtual" | "isEntity"
> & {
  pathIndex: number;
  distanceToAssignedOrg: number;
};

export function createUserProfileBuilder(deps: UserProfileBuilderDeps) {
  async function buildOne(userId: number) {
    return (await buildMany([userId]))[0] ?? null;
  }

  async function buildMany(userIds: number[]) {
    const uniqueUserIds = [...new Set(userIds)];
    const profiles: BuiltUserProfile[] = [];
    for (const chunk of chunks(uniqueUserIds, deps.config.batchSize)) {
      const dataset = await deps.buildRepository.loadByUserIds(chunk);
      profiles.push(...buildFromDataset(dataset, deps.clock.nowDate()));
    }
    return profiles;
  }

  return {
    buildOne,
    buildMany,
  };
}

export type UserProfileBuilder = ReturnType<typeof createUserProfileBuilder>;

function buildFromDataset(dataset: UserProfileBuildDataset, rebuiltAt: Date): BuiltUserProfile[] {
  const employmentRowsByUserId = groupBy(dataset.employments, row => row.userId);
  const positionById = new Map(dataset.positions.map(position => [position.id, position]));
  const orgPathByOrgId = buildOrgPathMap(dataset.orgPathRows);
  const roleRowsByEmploymentId = groupBy(dataset.roleRows, row => row.employmentId);
  const privilegesByRoleId = groupBy(dataset.privilegeRows, row => row.roleId);

  return dataset.users.map((user) => {
    const employmentDetails = (employmentRowsByUserId.get(user.id) ?? [])
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
      orcasId: null,
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

    return {
      userId: user.id,
      username: user.username,
      mobile: user.mobile,
      wxId: user.wxId,
      status: user.status,
      isDelete: user.isDelete,
      searchVisible: user.status === UserStatus.Enable && !user.isDelete,
      profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
      detail,
      searchDoc,
      rebuiltAt,
    };
  });
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
