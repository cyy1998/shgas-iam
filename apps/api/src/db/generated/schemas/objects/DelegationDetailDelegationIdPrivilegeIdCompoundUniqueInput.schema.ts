import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInput>;
export const DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInputObjectZodSchema = makeSchema();
