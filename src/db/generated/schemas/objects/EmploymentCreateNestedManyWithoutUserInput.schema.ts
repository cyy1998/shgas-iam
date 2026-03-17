import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutUserInputObjectSchema as EmploymentCreateWithoutUserInputObjectSchema } from './EmploymentCreateWithoutUserInput.schema';
import { EmploymentUncheckedCreateWithoutUserInputObjectSchema as EmploymentUncheckedCreateWithoutUserInputObjectSchema } from './EmploymentUncheckedCreateWithoutUserInput.schema';
import { EmploymentCreateOrConnectWithoutUserInputObjectSchema as EmploymentCreateOrConnectWithoutUserInputObjectSchema } from './EmploymentCreateOrConnectWithoutUserInput.schema';
import { EmploymentCreateManyUserInputEnvelopeObjectSchema as EmploymentCreateManyUserInputEnvelopeObjectSchema } from './EmploymentCreateManyUserInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutUserInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyUserInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentCreateNestedManyWithoutUserInputObjectSchema: z.ZodType<Prisma.EmploymentCreateNestedManyWithoutUserInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateNestedManyWithoutUserInput>;
export const EmploymentCreateNestedManyWithoutUserInputObjectZodSchema = makeSchema();
