import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutPositionInputObjectSchema as EmploymentUpdateWithoutPositionInputObjectSchema } from './EmploymentUpdateWithoutPositionInput.schema';
import { EmploymentUncheckedUpdateWithoutPositionInputObjectSchema as EmploymentUncheckedUpdateWithoutPositionInputObjectSchema } from './EmploymentUncheckedUpdateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutPositionInputObjectSchema)])
}).strict();
export const EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutPositionInput>;
export const EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
