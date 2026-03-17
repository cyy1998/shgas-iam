import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutPositionInputObjectSchema as EmploymentCreateWithoutPositionInputObjectSchema } from './EmploymentCreateWithoutPositionInput.schema';
import { EmploymentUncheckedCreateWithoutPositionInputObjectSchema as EmploymentUncheckedCreateWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutPositionInput>;
export const EmploymentCreateOrConnectWithoutPositionInputObjectZodSchema = makeSchema();
