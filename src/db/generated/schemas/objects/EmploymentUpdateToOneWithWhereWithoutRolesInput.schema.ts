import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema';
import { EmploymentUpdateWithoutRolesInputObjectSchema as EmploymentUpdateWithoutRolesInputObjectSchema } from './EmploymentUpdateWithoutRolesInput.schema';
import { EmploymentUncheckedUpdateWithoutRolesInputObjectSchema as EmploymentUncheckedUpdateWithoutRolesInputObjectSchema } from './EmploymentUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const EmploymentUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateToOneWithWhereWithoutRolesInput>;
export const EmploymentUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
