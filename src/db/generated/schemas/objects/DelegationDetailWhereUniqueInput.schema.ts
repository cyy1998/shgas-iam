import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInputObjectSchema as DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInputObjectSchema } from './DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  delegationId_privilegeId: z.lazy(() => DelegationDetailDelegationIdPrivilegeIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const DelegationDetailWhereUniqueInputObjectSchema: z.ZodType<Prisma.DelegationDetailWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailWhereUniqueInput>;
export const DelegationDetailWhereUniqueInputObjectZodSchema = makeSchema();
