import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutUserInputObjectSchema as EmploymentCreateWithoutUserInputObjectSchema } from './EmploymentCreateWithoutUserInput.schema';
import { EmploymentUncheckedCreateWithoutUserInputObjectSchema as EmploymentUncheckedCreateWithoutUserInputObjectSchema } from './EmploymentUncheckedCreateWithoutUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutUserInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutUserInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutUserInput>;
export const EmploymentCreateOrConnectWithoutUserInputObjectZodSchema = makeSchema();
