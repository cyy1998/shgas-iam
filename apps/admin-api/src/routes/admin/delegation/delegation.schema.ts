import { z } from "@hono/zod-openapi";
import { AdminAuthorizationDecisionSchema } from "@iam/contracts";
import { ClientDelegationStatus, DelegationCreateSchema, DelegationDetailSchema } from "@iam/delegation";

export const AdminDelegationCreateSchema = DelegationCreateSchema.extend({
  delegatorUsername: z.string().min(1).max(64),
  clientId: z.number().int().positive(),
});
export const DelegationIdSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
export const DelegationSelectorQuerySchema = z
  .object({ purpose: z.enum(["create", "filter"]), search: z.string().max(128).optional() })
  .strict();
export const DelegationUserOptionSchema = z.object({ id: z.number(), username: z.string(), name: z.string() });
export const DelegationClientOptionSchema = z.object({
  id: z.number(),
  clientCode: z.string(),
  clientName: z.string(),
});
export const DelegationOrganizationOptionSchema = z.object({
  id: z.number(),
  orgCode: z.string(),
  orgName: z.string(),
});
export const AdminDelegationVoSchema = DelegationDetailSchema.extend({
  allowedActions: z
    .object({
      edit: AdminAuthorizationDecisionSchema,
      pause: AdminAuthorizationDecisionSchema,
      resume: AdminAuthorizationDecisionSchema,
      end: AdminAuthorizationDecisionSchema,
    })
    .strict(),
});

export function toAdminDelegationVo(input: unknown) {
  const detail = DelegationDetailSchema.parse(input);
  const allowed = { allowed: true, reason: null } as const;
  const denied = { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" } as const;
  const ended = detail.status === ClientDelegationStatus.Disable;
  return AdminDelegationVoSchema.parse({
    ...detail,
    allowedActions: {
      edit: ended ? denied : allowed,
      pause: detail.status === ClientDelegationStatus.Enable ? allowed : denied,
      resume: detail.status === ClientDelegationStatus.Pause ? allowed : denied,
      end: ended ? denied : allowed,
    },
  });
}
