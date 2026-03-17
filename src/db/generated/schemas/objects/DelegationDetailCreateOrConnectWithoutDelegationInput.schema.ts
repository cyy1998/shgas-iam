import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailCreateWithoutDelegationInputObjectSchema as DelegationDetailCreateWithoutDelegationInputObjectSchema } from './DelegationDetailCreateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema)])
}).strict();
export const DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateOrConnectWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateOrConnectWithoutDelegationInput>;
export const DelegationDetailCreateOrConnectWithoutDelegationInputObjectZodSchema = makeSchema();
