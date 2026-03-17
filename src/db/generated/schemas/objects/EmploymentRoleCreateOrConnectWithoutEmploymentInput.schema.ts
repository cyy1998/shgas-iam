import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleCreateWithoutEmploymentInputObjectSchema as EmploymentRoleCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema)])
}).strict();
export const EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateOrConnectWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateOrConnectWithoutEmploymentInput>;
export const EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectZodSchema = makeSchema();
