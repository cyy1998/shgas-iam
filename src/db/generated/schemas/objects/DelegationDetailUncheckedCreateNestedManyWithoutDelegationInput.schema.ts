import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateWithoutDelegationInputObjectSchema as DelegationDetailCreateWithoutDelegationInputObjectSchema } from './DelegationDetailCreateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutDelegationInput.schema';
import { DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema as DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema } from './DelegationDetailCreateOrConnectWithoutDelegationInput.schema';
import { DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema as DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema } from './DelegationDetailCreateManyDelegationInputEnvelope.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema).array(), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput>;
export const DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectZodSchema = makeSchema();
