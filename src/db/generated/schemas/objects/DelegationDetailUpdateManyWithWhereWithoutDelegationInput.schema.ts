import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailScalarWhereInputObjectSchema as DelegationDetailScalarWhereInputObjectSchema } from './DelegationDetailScalarWhereInput.schema';
import { DelegationDetailUpdateManyMutationInputObjectSchema as DelegationDetailUpdateManyMutationInputObjectSchema } from './DelegationDetailUpdateManyMutationInput.schema';
import { DelegationDetailUncheckedUpdateManyWithoutDelegationInputObjectSchema as DelegationDetailUncheckedUpdateManyWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedUpdateManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => DelegationDetailUpdateManyMutationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateManyWithoutDelegationInputObjectSchema)])
}).strict();
export const DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateManyWithWhereWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateManyWithWhereWithoutDelegationInput>;
export const DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectZodSchema = makeSchema();
