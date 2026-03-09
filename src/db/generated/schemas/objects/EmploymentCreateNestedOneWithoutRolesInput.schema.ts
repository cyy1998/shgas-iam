import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutRolesInputObjectSchema as EmploymentCreateWithoutRolesInputObjectSchema } from './EmploymentCreateWithoutRolesInput.schema';
import { EmploymentUncheckedCreateWithoutRolesInputObjectSchema as EmploymentUncheckedCreateWithoutRolesInputObjectSchema } from './EmploymentUncheckedCreateWithoutRolesInput.schema';
import { EmploymentCreateOrConnectWithoutRolesInputObjectSchema as EmploymentCreateOrConnectWithoutRolesInputObjectSchema } from './EmploymentCreateOrConnectWithoutRolesInput.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => EmploymentCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => EmploymentWhereUniqueInputObjectSchema).optional()
}).strict();
export const EmploymentCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateNestedOneWithoutRolesInput>;
export const EmploymentCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
