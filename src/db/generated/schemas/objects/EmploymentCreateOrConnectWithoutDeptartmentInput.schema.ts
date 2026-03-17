import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentCreateWithoutDeptartmentInputObjectSchema as EmploymentCreateWithoutDeptartmentInputObjectSchema } from './EmploymentCreateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedCreateWithoutDeptartmentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema)])
}).strict();
export const EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentCreateOrConnectWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateOrConnectWithoutDeptartmentInput>;
export const EmploymentCreateOrConnectWithoutDeptartmentInputObjectZodSchema = makeSchema();
