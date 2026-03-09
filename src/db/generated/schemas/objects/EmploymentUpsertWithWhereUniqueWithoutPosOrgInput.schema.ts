import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutPosOrgInputObjectSchema as EmploymentUpdateWithoutPosOrgInputObjectSchema } from './EmploymentUpdateWithoutPosOrgInput.schema';
import { EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema as EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedUpdateWithoutPosOrgInput.schema';
import { EmploymentCreateWithoutPosOrgInputObjectSchema as EmploymentCreateWithoutPosOrgInputObjectSchema } from './EmploymentCreateWithoutPosOrgInput.schema';
import { EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentUpdateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutPosOrgInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema)])
}).strict();
export const EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutPosOrgInput>;
export const EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectZodSchema = makeSchema();
