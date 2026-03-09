import { z } from '@hono/zod-openapi';
export const DelegationDetailDeleteResultSchema = z.nullable(z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
  delegation: z.unknown(),
  privilege: z.unknown()
}));