import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int()
}).strict();
export const DelegationDetailCreateManyPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateManyPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyPrivilegeInput>;
export const DelegationDetailCreateManyPrivilegeInputObjectZodSchema = makeSchema();
