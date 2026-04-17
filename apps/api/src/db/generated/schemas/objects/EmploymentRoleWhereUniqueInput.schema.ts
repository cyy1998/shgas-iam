import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleEmploymentIdRoleIdCompoundUniqueInputObjectSchema as EmploymentRoleEmploymentIdRoleIdCompoundUniqueInputObjectSchema } from './EmploymentRoleEmploymentIdRoleIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  employmentId_roleId: z.lazy(() => EmploymentRoleEmploymentIdRoleIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const EmploymentRoleWhereUniqueInputObjectSchema: z.ZodType<Prisma.EmploymentRoleWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleWhereUniqueInput>;
export const EmploymentRoleWhereUniqueInputObjectZodSchema = makeSchema();
