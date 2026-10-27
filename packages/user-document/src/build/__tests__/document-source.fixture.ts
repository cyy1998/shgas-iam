import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import type { Employment, User } from "@iam/db/schema";
import type { DocumentBuildDataset } from "../document-build.repository";
import { createDocumentBuilder } from "../document-builder.service";
import type { UserDocumentBuildOrgPathRow, UserDocumentBuildPosition } from "../user-document-build.repository";
export const at = new Date("2026-10-26T10:00:00Z");
const base = { isDelete: false, createTime: at, updateTime: at };
export function user(id = 1, overrides: Partial<User> = {}): User {
  return {
    ...base,
    id,
    subjectIdentifier: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    username: `user-${id}`,
    name: `User ${id}`,
    mobile: null,
    wxId: null,
    password: null,
    userType: UserType.Formal,
    orderNum: 9,
    status: UserStatus.Enable,
    ...overrides,
  };
}
export function employment(id = 1, overrides: Partial<Employment> = {}): Employment {
  return {
    ...base,
    id,
    userId: 1,
    orgId: 1,
    posId: 1,
    status: EmploymentStatus.Enable,
    startTime: at,
    endTime: null,
    isPrimary: false,
    description: null,
    ...overrides,
  };
}
export function position(id = 1, overrides: Partial<UserDocumentBuildPosition> = {}): UserDocumentBuildPosition {
  return {
    ...base,
    id,
    posCode: `POS-${id}`,
    posName: `Position ${id}`,
    description: null,
    status: PositionStatus.Enable,
    ...overrides,
  };
}
export function org(id = 1, overrides: Partial<UserDocumentBuildOrgPathRow> = {}): UserDocumentBuildOrgPathRow {
  return {
    ...base,
    id,
    descendantId: id,
    depth: 0,
    orgCode: `ORG-${id}`,
    orgName: `Organization ${id}`,
    orgType: OrganizationType.Department,
    level: OrganizationLevel.One,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    ...overrides,
  };
}
export function dataset(overrides: Partial<DocumentBuildDataset> = {}): DocumentBuildDataset {
  return {
    users: [user()],
    employments: [],
    positions: [],
    orgPathRows: [],
    roleRows: [],
    responsibilityRows: [],
    ...overrides,
  };
}
export function builder(source: DocumentBuildDataset) {
  return createDocumentBuilder({
    buildRepository: { loadByUserIds: async () => source },
    clock: { nowDate: () => at },
    config: { batchSize: 10 },
  });
}
