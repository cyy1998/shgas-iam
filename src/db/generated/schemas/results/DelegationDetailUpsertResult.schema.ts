import * as z from 'zod';
export const DelegationDetailUpsertResultSchema = z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
  delegation: z.unknown(),
  privilege: z.unknown()
});