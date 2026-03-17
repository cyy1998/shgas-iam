import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateWithoutRoleInputObjectSchema as EmploymentRoleCreateWithoutRoleInputObjectSchema } from './EmploymentRoleCreateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutRoleInput.schema';
import { EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema as EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema } from './EmploymentRoleCreateOrConnectWithoutRoleInput.schema';
import { EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema as EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema } from './EmploymentRoleCreateManyRoleInputEnvelope.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput>;
export const EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectZodSchema = makeSchema();
