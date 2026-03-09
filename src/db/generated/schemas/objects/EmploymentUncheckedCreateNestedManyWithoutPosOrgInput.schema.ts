import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutPosOrgInputObjectSchema as EmploymentCreateWithoutPosOrgInputObjectSchema } from './EmploymentCreateWithoutPosOrgInput.schema';
import { EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateWithoutPosOrgInput.schema';
import { EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema as EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema } from './EmploymentCreateOrConnectWithoutPosOrgInput.schema';
import { EmploymentCreateManyPosOrgInputEnvelopeObjectSchema as EmploymentCreateManyPosOrgInputEnvelopeObjectSchema } from './EmploymentCreateManyPosOrgInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyPosOrgInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedCreateNestedManyWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedCreateNestedManyWithoutPosOrgInput>;
export const EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectZodSchema = makeSchema();
