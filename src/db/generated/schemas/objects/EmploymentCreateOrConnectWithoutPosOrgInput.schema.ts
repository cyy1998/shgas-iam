import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutPosOrgInputObjectSchema as EmploymentCreateWithoutPosOrgInputObjectSchema } from './EmploymentCreateWithoutPosOrgInput.schema';
import { EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutPosOrgInput>;
export const EmploymentCreateOrConnectWithoutPosOrgInputObjectZodSchema = makeSchema();
