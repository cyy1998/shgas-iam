import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutPositionInputObjectSchema as EmploymentCreateWithoutPositionInputObjectSchema } from './EmploymentCreateWithoutPositionInput.schema';
import { EmploymentUncheckedCreateWithoutPositionInputObjectSchema as EmploymentUncheckedCreateWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateWithoutPositionInput.schema';
import { EmploymentCreateOrConnectWithoutPositionInputObjectSchema as EmploymentCreateOrConnectWithoutPositionInputObjectSchema } from './EmploymentCreateOrConnectWithoutPositionInput.schema';
import { EmploymentCreateManyPositionInputEnvelopeObjectSchema as EmploymentCreateManyPositionInputEnvelopeObjectSchema } from './EmploymentCreateManyPositionInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyPositionInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentCreateNestedManyWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentCreateNestedManyWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateNestedManyWithoutPositionInput>;
export const EmploymentCreateNestedManyWithoutPositionInputObjectZodSchema = makeSchema();
