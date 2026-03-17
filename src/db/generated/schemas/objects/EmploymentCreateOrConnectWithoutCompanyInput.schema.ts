import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutCompanyInputObjectSchema as EmploymentCreateWithoutCompanyInputObjectSchema } from './EmploymentCreateWithoutCompanyInput.schema';
import { EmploymentUncheckedCreateWithoutCompanyInputObjectSchema as EmploymentUncheckedCreateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedCreateWithoutCompanyInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutCompanyInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutCompanyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutCompanyInput>;
export const EmploymentCreateOrConnectWithoutCompanyInputObjectZodSchema = makeSchema();
