import { z } from "zod";
import { OrganizationLevel } from "./enums/organization.level";
import { OrganizationStatus } from "./enums/organization.status";
import { OrganizationType } from "./enums/organization.type";
import { UserStatus } from "./enums/user.status";
import { UserType } from "./enums/user.type";
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityTypeCode,
} from "./organization-responsibility";

export const OrganizationNodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(OrganizationType),
});

export const OrganizationPathNodeSchema = OrganizationNodeSchema.extend({
  level: z.enum(OrganizationLevel),
  distanceToTarget: z
    .number()
    .int()
    .min(0)
    .max(OrganizationLevel.Five - 1),
});

export const OrganizationReferenceSchema = OrganizationNodeSchema.extend({
  path: z.array(OrganizationPathNodeSchema).min(1).max(OrganizationLevel.Five),
}).superRefine((organization, context) => {
  const path = organization.path;
  const terminal = path.at(-1);
  if (
    path.some((node, index) => node.level !== index + 1 || node.distanceToTarget !== path.length - index - 1) ||
    terminal?.code !== organization.code ||
    terminal.name !== organization.name ||
    terminal.type !== organization.type ||
    new Set(path.map((node) => node.code)).size !== path.length
  ) {
    context.addIssue({ code: "custom", path: ["path"], message: "组织路径必须完整、有序并包含一致的目标自身" });
  }
});

export const OrganizationDocumentSchema = z.object({
  organization: OrganizationReferenceSchema.safeExtend({
    level: z.enum(OrganizationLevel),
    status: z.enum(OrganizationStatus),
    isVirtual: z.boolean(),
    isEntity: z.boolean(),
  }).superRefine((organization, context) => {
    if (organization.level !== organization.path.length) {
      context.addIssue({ code: "custom", path: ["level"], message: "组织层级必须与完整路径一致" });
    }
  }),
});

export const DocumentResponsibilitySchema = z.object({
  type: z
    .object({
      code: z.enum(OrganizationResponsibilityTypeCode),
      name: z.string().min(1),
    })
    .superRefine((type, context) => {
      if (
        !ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.some((entry) => entry.code === type.code && entry.name === type.name)
      ) {
        context.addIssue({ code: "custom", path: ["name"], message: "责任类型名称必须来自当前 Catalog" });
      }
    }),
  targetOrganization: OrganizationReferenceSchema,
});

export const DocumentUserSchema = z.object({
  subjectIdentifier: z.uuid(),
  username: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  mobile: z.string().max(20).nullable(),
  wxId: z.string().max(255).nullable(),
  userType: z.enum(UserType),
  status: z.enum(UserStatus),
});

export const DocumentEmploymentSchema = z.object({
  isPrimary: z.boolean(),
  organization: OrganizationReferenceSchema,
  position: z.object({ code: z.string().min(1), name: z.string().min(1) }),
  responsibilities: z.array(DocumentResponsibilitySchema),
  roles: z.array(z.string().min(1)),
});

export const UserDocumentSchema = z.object({
  user: DocumentUserSchema,
  employments: z.array(DocumentEmploymentSchema),
});

export type OrganizationPathNode = z.infer<typeof OrganizationPathNodeSchema>;
export type OrganizationReference = z.infer<typeof OrganizationReferenceSchema>;
export type OrganizationDocument = z.infer<typeof OrganizationDocumentSchema>;
export type DocumentResponsibility = z.infer<typeof DocumentResponsibilitySchema>;
export type UserDocument = z.infer<typeof UserDocumentSchema>;
