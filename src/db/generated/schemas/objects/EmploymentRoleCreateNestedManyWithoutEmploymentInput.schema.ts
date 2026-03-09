import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateWithoutEmploymentInputObjectSchema as EmploymentRoleCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutEmploymentInput.schema';
import { EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema as EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateOrConnectWithoutEmploymentInput.schema';
import { EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema as EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema } from './EmploymentRoleCreateManyEmploymentInputEnvelope.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema).array(), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentRoleCreateNestedManyWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateNestedManyWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateNestedManyWithoutEmploymentInput>;
export const EmploymentRoleCreateNestedManyWithoutEmploymentInputObjectZodSchema = makeSchema();
