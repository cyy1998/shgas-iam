import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithoutRoleInputObjectSchema as EmploymentRoleUpdateWithoutRoleInputObjectSchema } from './EmploymentRoleUpdateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedUpdateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema)])
}).strict();
export const EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput>;
export const EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
