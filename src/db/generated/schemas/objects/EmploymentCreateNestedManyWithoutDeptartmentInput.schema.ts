import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutDeptartmentInputObjectSchema as EmploymentCreateWithoutDeptartmentInputObjectSchema } from './EmploymentCreateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedCreateWithoutDeptartmentInput.schema';
import { EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema as EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema } from './EmploymentCreateOrConnectWithoutDeptartmentInput.schema';
import { EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema as EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema } from './EmploymentCreateManyDeptartmentInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentCreateNestedManyWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateNestedManyWithoutDeptartmentInput>;
export const EmploymentCreateNestedManyWithoutDeptartmentInputObjectZodSchema = makeSchema();
