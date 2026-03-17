import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCountOutputTypeCountPositionsArgsObjectSchema as RoleCountOutputTypeCountPositionsArgsObjectSchema } from './RoleCountOutputTypeCountPositionsArgs.schema';
import { RoleCountOutputTypeCountOrganizationsArgsObjectSchema as RoleCountOutputTypeCountOrganizationsArgsObjectSchema } from './RoleCountOutputTypeCountOrganizationsArgs.schema';
import { RoleCountOutputTypeCountPositionOrganizationsArgsObjectSchema as RoleCountOutputTypeCountPositionOrganizationsArgsObjectSchema } from './RoleCountOutputTypeCountPositionOrganizationsArgs.schema';
import { RoleCountOutputTypeCountEmploymentsArgsObjectSchema as RoleCountOutputTypeCountEmploymentsArgsObjectSchema } from './RoleCountOutputTypeCountEmploymentsArgs.schema';
import { RoleCountOutputTypeCountPrivilegesArgsObjectSchema as RoleCountOutputTypeCountPrivilegesArgsObjectSchema } from './RoleCountOutputTypeCountPrivilegesArgs.schema'

const makeSchema = () => z.object({
  positions: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeCountPositionsArgsObjectSchema)]).optional(),
  organizations: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeCountOrganizationsArgsObjectSchema)]).optional(),
  positionOrganizations: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeCountPositionOrganizationsArgsObjectSchema)]).optional(),
  employments: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeCountEmploymentsArgsObjectSchema)]).optional(),
  privileges: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeCountPrivilegesArgsObjectSchema)]).optional()
}).strict();
export const RoleCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.RoleCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.RoleCountOutputTypeSelect>;
export const RoleCountOutputTypeSelectObjectZodSchema = makeSchema();
