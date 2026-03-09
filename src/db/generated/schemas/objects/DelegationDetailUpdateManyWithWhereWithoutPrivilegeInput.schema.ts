import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailScalarWhereInputObjectSchema as DelegationDetailScalarWhereInputObjectSchema } from './DelegationDetailScalarWhereInput.schema';
import { DelegationDetailUpdateManyMutationInputObjectSchema as DelegationDetailUpdateManyMutationInputObjectSchema } from './DelegationDetailUpdateManyMutationInput.schema';
import { DelegationDetailUncheckedUpdateManyWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedUpdateManyWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedUpdateManyWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => DelegationDetailUpdateManyMutationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateManyWithoutPrivilegeInputObjectSchema)])
}).strict();
export const DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateManyWithWhereWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateManyWithWhereWithoutPrivilegeInput>;
export const DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectZodSchema = makeSchema();
