import { z } from "@hono/zod-openapi";
import * as PrismaSchema from "@/db/generated/schemas";
import { OrganizationDtoConverterSchema, OrganizationDtoSchema } from "../organization/organization.schema";
import { UserDtoSchema } from "../user/user.schema";
import { PrivilegeDtoSchema } from "./privilege.schema";

export const PrivilegeDelegationSchema = z.object(PrismaSchema.PrivilegeDelegationSchema.shape);

export const PrivilegeDelegationDetailSchema = PrivilegeDelegationSchema.extend({
  delegatorUser: PrismaSchema.UserSchema,
  delegateeUser: PrismaSchema.UserSchema,
  organizationScope: PrismaSchema.OrganizationSchema.extend({
    parent: PrismaSchema.OrganizationSchema.nullable(),
    children: z.array(PrismaSchema.OrganizationSchema),
  }),
  delegationDetails: z.array(PrismaSchema.DelegationDetailSchema.extend({
    privilege: PrismaSchema.PrivilegeSchema,
  })),
});

export const PrivilegeDelegationDtoSchema = PrivilegeDelegationSchema.extend({
  delegatorUsername: z.string().openapi({ example: "138550" }),
  delegatorName: z.string().openapi({ example: "蔡奕阳" }),
  delegateeUsername: z.string().openapi({ example: "138550" }),
  delegateeName: z.string().openapi({ example: "蔡奕阳" }),
}).required().openapi("PrivilegeDelegationDto");

export const PrivilegeDelegationDtoConverterSchema = PrivilegeDelegationDetailSchema.transform((e) => {
  const { delegatorUser, delegateeUser, organizationScope, delegationDetails, ...rest } = e;
  return {
    ...rest,
    delegatorUsername: delegatorUser.username,
    delegatorName: delegatorUser.name,
    delegateeUsername: delegateeUser.username,
    delegateeName: delegateeUser.name,
  };
}).pipe(PrivilegeDelegationDtoSchema);

export const PrivilegeDelegationDetailDtoSchema = PrivilegeDelegationDetailSchema.extend({
  delegatorUsername: z.string().openapi({ example: "138550" }),
  delegatorName: z.string().openapi({ example: "蔡奕阳" }),
  delegateeUsername: z.string().openapi({ example: "138550" }),
  delegateeName: z.string().openapi({ example: "蔡奕阳" }),
  delegatorUser: UserDtoSchema,
  delegateeUser: UserDtoSchema,
  organizationScope: OrganizationDtoSchema,
  privileges: z.array(PrivilegeDtoSchema),
}).omit({
  delegationDetails: true,
}).required().openapi("PrivilegeDelegationDetailDto");

export const PrivilegeDelegationDetailDtoConverterSchema = PrivilegeDelegationDetailSchema.transform((e) => {
  const { delegationDetails, ...rest } = e;
  return {
    ...rest,
    delegatorUsername: e.delegatorUser.username,
    delegatorName: e.delegatorUser.name,
    delegateeUsername: e.delegateeUser.username,
    delegateeName: e.delegateeUser.name,
    delegatorUser: UserDtoSchema.parse(e.delegatorUser),
    delegateeUser: UserDtoSchema.parse(e.delegateeUser),
    organizationScope: OrganizationDtoConverterSchema.parse(e.organizationScope),
    privileges: e.delegationDetails.map(detail => PrivilegeDtoSchema.parse(detail.privilege)),
  };
}).pipe(PrivilegeDelegationDetailDtoSchema);

export const PrivilegeDelegationQueryDtoSchema = z.object({
  delegatorUsernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
  delegateeUsernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
  orgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  privCodes: z.array(z.string()).optional().openapi({ example: ["ui:button:tender:create-GYBG"] }),
  validTime: z.iso.datetime().optional().openapi({ example: "2024-01-01T00:00:00Z" }),
}).openapi("PrivilegeDelegationQueryDto");

export const PrivilegeDelegationCreateDtoSchema = PrivilegeDelegationSchema.omit({
  id: true,
  createTime: true,
  updateTime: true,
  isDelete: true,
}).partial({
  delegateeUserId: true,
  delegatorUserId: true,
  organizationScopeId: true,
}).extend({
  delegatorUsername: z.string().openapi({ example: "138550" }),
  delegateeUsername: z.string().openapi({ example: "138550" }),
  orgCode: z.string().openapi({ example: "SR23" }),
  privilegeCodes: z.array(z.string()).openapi({ example: ["tender:flow:SR_CZLX"] }),
  privilegeIds: z.array(z.number()).optional().openapi({ example: [1, 2] }),
}).openapi("PrivilegeDelegationCreateDto");
