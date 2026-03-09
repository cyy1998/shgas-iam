import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutDeptartmentInputObjectSchema as EmploymentUpdateWithoutDeptartmentInputObjectSchema } from './EmploymentUpdateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedUpdateWithoutDeptartmentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema)])
}).strict();
export const EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput>;
export const EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectZodSchema = makeSchema();
