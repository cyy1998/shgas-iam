import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './OrganizationRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereInputObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeCountOrganizationsArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeCountOrganizationsArgsObjectZodSchema = makeSchema();
