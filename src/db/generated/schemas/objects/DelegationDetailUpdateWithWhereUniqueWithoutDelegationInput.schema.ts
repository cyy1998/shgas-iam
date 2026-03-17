import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithoutDelegationInputObjectSchema as DelegationDetailUpdateWithoutDelegationInputObjectSchema } from './DelegationDetailUpdateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedUpdateWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => DelegationDetailUpdateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema)])
}).strict();
export const DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput>;
export const DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectZodSchema = makeSchema();
