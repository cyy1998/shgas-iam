import * as z from 'zod';
export const DelegationDetailCreateResultSchema = z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
  delegation: z.unknown(),
  privilege: z.unknown()
});