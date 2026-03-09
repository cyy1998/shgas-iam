import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithoutEmploymentInputObjectSchema as EmploymentRoleUpdateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUpdateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedUpdateWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentRoleUpdateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema)])
}).strict();
export const EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput>;
export const EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectZodSchema = makeSchema();
