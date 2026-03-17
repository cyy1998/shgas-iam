import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithoutDelegationInputObjectSchema as DelegationDetailUpdateWithoutDelegationInputObjectSchema } from './DelegationDetailUpdateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedUpdateWithoutDelegationInput.schema';
import { DelegationDetailCreateWithoutDelegationInputObjectSchema as DelegationDetailCreateWithoutDelegationInputObjectSchema } from './DelegationDetailCreateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => DelegationDetailUpdateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema)]),
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema)])
}).strict();
export const DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput>;
export const DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectZodSchema = makeSchema();
