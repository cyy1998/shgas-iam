import * as z from 'zod';
export const DelegationDetailUpdateResultSchema = z.nullable(z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
  delegation: z.unknown(),
  privilege: z.unknown()
}));