import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutPosOrgInputObjectSchema as EmploymentUpdateWithoutPosOrgInputObjectSchema } from './EmploymentUpdateWithoutPosOrgInput.schema';
import { EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema as EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedUpdateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema)])
}).strict();
export const EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutPosOrgInput>;
export const EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectZodSchema = makeSchema();
