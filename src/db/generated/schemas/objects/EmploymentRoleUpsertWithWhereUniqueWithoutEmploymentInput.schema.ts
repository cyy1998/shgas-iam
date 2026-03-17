import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithoutEmploymentInputObjectSchema as EmploymentRoleUpdateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUpdateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedUpdateWithoutEmploymentInput.schema';
import { EmploymentRoleCreateWithoutEmploymentInputObjectSchema as EmploymentRoleCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentRoleUpdateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema)])
}).strict();
export const EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput>;
export const EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectZodSchema = makeSchema();
