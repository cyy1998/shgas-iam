import type { AdmissionReferenceKind } from "@admin/services/client-admission";
import {
  getUserStatusOptions,
  getUserTypeOptions,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationLevel,
  OrganizationType,
  UserDocumentSchema,
} from "@iam/contracts";

export type ConditionValue = string | number | boolean;
export type ConditionField = {
  label: string;
  options?: { label: string; value: ConditionValue }[];
  reference?: AdmissionReferenceKind;
  collection?: boolean;
  nullable?: boolean;
  integer?: boolean;
  validate?: (value: ConditionValue) => boolean;
};

const organizationTypes = Object.values(OrganizationType).map((value) => ({ label: value, value }));
const organizationLevels = [
  OrganizationLevel.One,
  OrganizationLevel.Two,
  OrganizationLevel.Three,
  OrganizationLevel.Four,
  OrganizationLevel.Five,
].map((value) => ({ label: String(value), value }));

const organizationFields = {
  code: { label: "组织编码", reference: "organization" },
  name: { label: "组织名称" },
  type: { label: "组织类型", options: organizationTypes },
} satisfies Record<string, ConditionField>;

const pathFields = {
  code: { ...organizationFields.code, label: "路径组织编码" },
  name: { ...organizationFields.name, label: "路径组织名称" },
  type: { ...organizationFields.type, label: "路径组织类型" },
  level: { label: "路径组织层级", options: organizationLevels },
  distanceToTarget: { label: "到目标组织的距离", integer: true },
} satisfies Record<string, ConditionField>;

export type ConditionScope = {
  fields: Record<string, ConditionField>;
  collections: Record<string, { label: string; scope: ConditionScope; hint?: string }>;
};

const pathScope: ConditionScope = { fields: pathFields, collections: {} };

const responsibilityScope: ConditionScope = {
  fields: {
    "type.code": {
      label: "责任类型编码",
      options: ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(({ code, name }) => ({ label: name, value: code })),
    },
    "type.name": {
      label: "责任类型名称",
      options: ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(({ name }) => ({ label: name, value: name })),
    },
    "targetOrganization.code": { ...organizationFields.code, label: "责任目标组织编码" },
    "targetOrganization.name": { ...organizationFields.name, label: "责任目标组织名称" },
    "targetOrganization.type": { ...organizationFields.type, label: "责任目标组织类型" },
  },
  collections: {
    "targetOrganization.path": {
      label: "存在满足条件的责任目标组织路径节点",
      scope: pathScope,
      hint: "条件匹配同一个路径节点。按路径组织编码匹配时，包含该组织自身及其后代。",
    },
  },
};

const employmentScope: ConditionScope = {
  fields: {
    isPrimary: {
      label: "是否主任职",
      options: [
        { label: "是", value: true },
        { label: "否", value: false },
      ],
    },
    "organization.code": organizationFields.code,
    "organization.name": organizationFields.name,
    "organization.type": organizationFields.type,
    "position.code": { label: "岗位编码", reference: "position" },
    "position.name": { label: "岗位名称" },
    roles: { label: "角色编码", reference: "role", collection: true },
  },
  collections: {
    "organization.path": {
      label: "存在满足条件的任职组织路径节点",
      scope: pathScope,
      hint: "条件匹配同一个路径节点。按路径组织编码匹配时，包含该组织自身及其后代。",
    },
    responsibilities: {
      label: "存在满足条件的组织责任",
      scope: responsibilityScope,
      hint: "组内所有条件针对同一项组织责任。",
    },
  },
};

export const userScope: ConditionScope = {
  fields: {
    userType: { label: "用户类型", options: getUserTypeOptions() },
    subjectIdentifier: {
      label: "主体标识",
      validate: (value) => UserDocumentSchema.shape.subjectIdentifier.safeParse(value).success,
    },
    username: { label: "账号" },
    name: { label: "姓名" },
    mobile: { label: "手机号", nullable: true },
    wxId: { label: "微信 ID", nullable: true },
    status: { label: "用户状态", options: getUserStatusOptions() },
  },
  collections: {
    employments: {
      label: "存在满足条件的有效任职",
      scope: employmentScope,
      hint: "组内所有条件针对同一条有效任职。没有有效任职时，本条件为假，外层排除后可为真。",
    },
  },
};
