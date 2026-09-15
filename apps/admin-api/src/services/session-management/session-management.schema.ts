import { createAdminMutationResultSchema } from "@iam/contracts";
import { CapturedSessionSchema } from "@iam/session-kernel";
import { z } from "zod";

export const UnifiedSessionEffectSchema = z
  .object({
    userSessionsTerminated: z.int().nonnegative(),
    clientSessionsTerminated: z.int().nonnegative(),
    excluded: z.int().nonnegative(),
    failed: z.int().nonnegative(),
    unknown: z.int().nonnegative(),
  })
  .strict();

const UnifiedSessionRevokeSchema = z
  .object({
    scope: z.enum(["session", "user"]),
    generation: z.literal("unified"),
    sessions: UnifiedSessionEffectSchema,
    currentPrincipalSessionExcluded: z.boolean(),
    batch: z
      .object({
        results: z.array(
          z
            .object({
              target: CapturedSessionSchema,
              status: z.enum([
                "terminated",
                "already_terminated",
                "missing",
                "expired",
                "excluded",
                "replaced",
                "failed",
                "unknown",
              ]),
            })
            .strict(),
        ),
        unfinished: z.array(CapturedSessionSchema),
      })
      .strict()
      .optional(),
    artifactCleanup: z
      .object({
        attempted: z.int().nonnegative(),
        succeeded: z.int().nonnegative(),
        failed: z.int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AdminSessionRevokeResultSchema
  = createAdminMutationResultSchema(UnifiedSessionRevokeSchema).strict();

export const AdminLoginRestrictionReleaseResultSchema = createAdminMutationResultSchema(
  z
    .object({
      failureStateCleared: z.literal(true),
    })
    .strict(),
).strict();
