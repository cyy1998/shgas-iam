import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutCompanyInputObjectSchema as EmploymentUpdateWithoutCompanyInputObjectSchema } from './EmploymentUpdateWithoutCompanyInput.schema';
import { EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema as EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedUpdateWithoutCompanyInput.schema';
import { EmploymentCreateWithoutCompanyInputObjectSchema as EmploymentCreateWithoutCompanyInputObjectSchema } from './EmploymentCreateWithoutCompanyInput.schema';
import { EmploymentUncheckedCreateWithoutCompanyInputObjectSchema as EmploymentUncheckedCreateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedCreateWithoutCompanyInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentUpdateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutCompanyInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema)])
}).strict();
export const EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutCompanyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutCompanyInput>;
export const EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectZodSchema = makeSchema();
