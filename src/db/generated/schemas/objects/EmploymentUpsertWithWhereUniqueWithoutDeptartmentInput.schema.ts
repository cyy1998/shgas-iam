import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutDeptartmentInputObjectSchema as EmploymentUpdateWithoutDeptartmentInputObjectSchema } from './EmploymentUpdateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedUpdateWithoutDeptartmentInput.schema';
import { EmploymentCreateWithoutDeptartmentInputObjectSchema as EmploymentCreateWithoutDeptartmentInputObjectSchema } from './EmploymentCreateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedCreateWithoutDeptartmentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentUpdateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutDeptartmentInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema)])
}).strict();
export const EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput>;
export const EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectZodSchema = makeSchema();
