import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './PosOrgRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereInputObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeCountPositionOrganizationsArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeCountPositionOrganizationsArgsObjectZodSchema = makeSchema();
