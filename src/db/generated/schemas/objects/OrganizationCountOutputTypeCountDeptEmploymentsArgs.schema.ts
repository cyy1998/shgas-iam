import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereInputObjectSchema).optional()
}).strict();
export const OrganizationCountOutputTypeCountDeptEmploymentsArgsObjectSchema = makeSchema();
export const OrganizationCountOutputTypeCountDeptEmploymentsArgsObjectZodSchema = makeSchema();
