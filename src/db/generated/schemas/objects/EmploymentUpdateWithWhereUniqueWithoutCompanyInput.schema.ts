import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutCompanyInputObjectSchema as EmploymentUpdateWithoutCompanyInputObjectSchema } from './EmploymentUpdateWithoutCompanyInput.schema';
import { EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema as EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedUpdateWithoutCompanyInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema)])
}).strict();
export const EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutCompanyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutCompanyInput>;
export const EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectZodSchema = makeSchema();
