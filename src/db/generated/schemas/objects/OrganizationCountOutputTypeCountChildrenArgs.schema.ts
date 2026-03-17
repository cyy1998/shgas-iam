import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationCountOutputTypeCountChildrenArgsObjectSchema = makeSchema();
export const OrganizationCountOutputTypeCountChildrenArgsObjectZodSchema = makeSchema();
