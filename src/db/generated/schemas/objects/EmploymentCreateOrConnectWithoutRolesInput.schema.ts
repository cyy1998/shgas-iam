import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutRolesInputObjectSchema as EmploymentCreateWithoutRolesInputObjectSchema } from './EmploymentCreateWithoutRolesInput.schema';
import { EmploymentUncheckedCreateWithoutRolesInputObjectSchema as EmploymentUncheckedCreateWithoutRolesInputObjectSchema } from './EmploymentUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutRolesInput>;
export const EmploymentCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
