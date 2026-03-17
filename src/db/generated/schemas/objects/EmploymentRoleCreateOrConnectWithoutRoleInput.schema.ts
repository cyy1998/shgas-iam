import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleCreateWithoutRoleInputObjectSchema as EmploymentRoleCreateWithoutRoleInputObjectSchema } from './EmploymentRoleCreateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateOrConnectWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateOrConnectWithoutRoleInput>;
export const EmploymentRoleCreateOrConnectWithoutRoleInputObjectZodSchema = makeSchema();
