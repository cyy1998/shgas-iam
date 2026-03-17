import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUpdateWithoutRolesInputObjectSchema as EmploymentUpdateWithoutRolesInputObjectSchema } from './EmploymentUpdateWithoutRolesInput.schema';
import { EmploymentUncheckedUpdateWithoutRolesInputObjectSchema as EmploymentUncheckedUpdateWithoutRolesInputObjectSchema } from './EmploymentUncheckedUpdateWithoutRolesInput.schema';
import { EmploymentCreateWithoutRolesInputObjectSchema as EmploymentCreateWithoutRolesInputObjectSchema } from './EmploymentCreateWithoutRolesInput.schema';
import { EmploymentUncheckedCreateWithoutRolesInputObjectSchema as EmploymentUncheckedCreateWithoutRolesInputObjectSchema } from './EmploymentUncheckedCreateWithoutRolesInput.schema';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => EmploymentUpdateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => EmploymentWhereInputObjectSchema).optional()
}).strict();
export const EmploymentUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithoutRolesInput>;
export const EmploymentUpsertWithoutRolesInputObjectZodSchema = makeSchema();
