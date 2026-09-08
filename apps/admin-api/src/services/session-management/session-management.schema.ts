import { createAdminMutationResultSchema } from "@iam/contracts";
import { z } from "zod";

export const AdminSessionRevokeResultSchema = createAdminMutationResultSchema(z.object({
  scope: z.enum(["session", "user"]),
  revoked: z.object({
    principalSessions: z.int().nonnegative(),
    bindings: z.int().nonnegative(),
    credentials: z.int().nonnegative(),
    artifacts: z.int().nonnegative(),
  }).strict(),
  currentPrincipalSessionExcluded: z.boolean(),
  cleanup: z.object({
    attempted: z.int().nonnegative(),
    succeeded: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }).strict(),
}).strict()).strict();

export const AdminLoginRestrictionReleaseResultSchema = createAdminMutationResultSchema(z.object({
  failureStateCleared: z.literal(true),
}).strict()).strict();
