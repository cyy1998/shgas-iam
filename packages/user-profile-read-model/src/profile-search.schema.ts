import { z } from "@hono/zod-openapi";
import { UserStatus, UserType } from "@iam/contracts";

export const UserProfileSearchEmploymentDocSchema = z.object({
  id: z.number().int().positive(),
  org: z.object({
    id: z.number().int().positive(),
    code: z.string(),
    ancestorCodes: z.array(z.string()),
    ancestorDepths: z.array(z.number().int().nonnegative()),
    ancestorKeys: z.array(z.string()),
    companyCodes: z.array(z.string()),
  }),
  position: z.object({
    id: z.number().int().positive(),
    code: z.string(),
  }),
  roles: z.array(z.string()),
  privileges: z.array(z.string()),
  isPrimary: z.boolean(),
});

export const UserProfileSearchDocSchema = z.object({
  user: z.object({
    id: z.number().int().positive(),
    username: z.string(),
    name: z.string(),
    mobile: z.string().nullable(),
    wxId: z.string().nullable(),
    userType: z.enum(UserType),
    status: z.enum(UserStatus),
  }),
  employments: z.array(UserProfileSearchEmploymentDocSchema),
});

export type UserProfileSearchDoc = z.infer<typeof UserProfileSearchDocSchema>;
