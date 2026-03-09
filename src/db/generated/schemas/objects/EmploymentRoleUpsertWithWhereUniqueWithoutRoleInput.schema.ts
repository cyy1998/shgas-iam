import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithoutRoleInputObjectSchema as EmploymentRoleUpdateWithoutRoleInputObjectSchema } from './EmploymentRoleUpdateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedUpdateWithoutRoleInput.schema';
import { EmploymentRoleCreateWithoutRoleInputObjectSchema as EmploymentRoleCreateWithoutRoleInputObjectSchema } from './EmploymentRoleCreateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput>;
export const EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
