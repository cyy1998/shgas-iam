import * as z from 'zod';

export const DelegationDetailSchema = z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
});

export type DelegationDetailType = z.infer<typeof DelegationDetailSchema>;
