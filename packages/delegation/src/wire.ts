import { ClientDelegationStatus } from "@iam/contracts";
import { z } from "zod";

export { ClientDelegationStatus } from "@iam/contracts";

const username = z.string().min(1).max(64);
export const DelegationCreateSchema = z
  .object({
    delegatorUsername: username.optional(),
    delegateeUsername: username,
    clientId: z.number().int().positive().optional(),
    orgCode: z.string().min(1).max(64),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    description: z.string().max(500).nullish(),
  })
  .strict();
export const DelegationUpdateSchema = z
  .object({
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    description: z.string().max(500).nullish(),
    status: z.enum(ClientDelegationStatus).optional(),
  })
  .strict();
export const DelegationSearchSchema = z
  .object({
    delegatorUsernames: z.array(username).optional(),
    delegateeUsernames: z.array(username).optional(),
    clientIds: z.array(z.number().int().positive()).optional(),
    orgCodes: z.array(z.string().min(1)).optional(),
    statuses: z.array(z.enum(ClientDelegationStatus)).optional(),
    validTime: z.coerce.date().optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
  })
  .strict();
export const DelegationResolveSchema = z
  .object({
    usernames: z
      .array(username)
      .min(1)
      .max(100)
      .refine((value) => new Set(value).size === value.length, {
        message: "usernames must not contain exact duplicates",
      }),
    orgCode: z.string().min(1),
  })
  .strict();
const userSummary = z.object({ id: z.number(), username, name: z.string(), isDelete: z.boolean() }).strict();
const clientSummary = z
  .object({ id: z.number(), clientCode: z.string(), clientName: z.string(), isDelete: z.boolean() })
  .strict();
const orgSummary = z
  .object({ id: z.number(), orgCode: z.string(), orgName: z.string(), isDelete: z.boolean() })
  .strict();
export const DelegationDetailSchema = z
  .object({
    id: z.number(),
    delegatorUserId: z.number(),
    delegateeUserId: z.number(),
    clientId: z.number(),
    organizationScopeId: z.number(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    status: z.enum(ClientDelegationStatus),
    description: z.string().nullable(),
    createTime: z.coerce.date(),
    updateTime: z.coerce.date(),
    delegatorUser: userSummary,
    delegateeUser: userSummary,
    client: clientSummary,
    organizationScope: orgSummary,
    delegatorUsername: username,
    delegatorName: z.string(),
    delegateeUsername: username,
    delegateeName: z.string(),
  })
  .strict();
export type DelegationCreateInput = z.infer<typeof DelegationCreateSchema>;
export type DelegationUpdateInput = z.infer<typeof DelegationUpdateSchema>;
export type DelegationSearchInput = z.infer<typeof DelegationSearchSchema>;
export type DelegationDetail = z.infer<typeof DelegationDetailSchema>;
export type DelegationResolveInput = z.infer<typeof DelegationResolveSchema>;
