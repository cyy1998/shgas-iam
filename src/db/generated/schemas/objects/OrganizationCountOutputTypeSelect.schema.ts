import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCountOutputTypeCountDeptEmploymentsArgsObjectSchema as OrganizationCountOutputTypeCountDeptEmploymentsArgsObjectSchema } from './OrganizationCountOutputTypeCountDeptEmploymentsArgs.schema';
import { OrganizationCountOutputTypeCountCompEmploymentsArgsObjectSchema as OrganizationCountOutputTypeCountCompEmploymentsArgsObjectSchema } from './OrganizationCountOutputTypeCountCompEmploymentsArgs.schema';
import { OrganizationCountOutputTypeCountRolesArgsObjectSchema as OrganizationCountOutputTypeCountRolesArgsObjectSchema } from './OrganizationCountOutputTypeCountRolesArgs.schema';
import { OrganizationCountOutputTypeCountPosOrgCompositionArgsObjectSchema as OrganizationCountOutputTypeCountPosOrgCompositionArgsObjectSchema } from './OrganizationCountOutputTypeCountPosOrgCompositionArgs.schema';
import { OrganizationCountOutputTypeCountChildrenArgsObjectSchema as OrganizationCountOutputTypeCountChildrenArgsObjectSchema } from './OrganizationCountOutputTypeCountChildrenArgs.schema';
import { OrganizationCountOutputTypeCountAncestorClosuresArgsObjectSchema as OrganizationCountOutputTypeCountAncestorClosuresArgsObjectSchema } from './OrganizationCountOutputTypeCountAncestorClosuresArgs.schema';
import { OrganizationCountOutputTypeCountDescendantClosuresArgsObjectSchema as OrganizationCountOutputTypeCountDescendantClosuresArgsObjectSchema } from './OrganizationCountOutputTypeCountDescendantClosuresArgs.schema';
import { OrganizationCountOutputTypeCountPrivilegeDelegationsArgsObjectSchema as OrganizationCountOutputTypeCountPrivilegeDelegationsArgsObjectSchema } from './OrganizationCountOutputTypeCountPrivilegeDelegationsArgs.schema'

const makeSchema = () => z.object({
  deptEmployments: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountDeptEmploymentsArgsObjectSchema)]).optional(),
  compEmployments: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountCompEmploymentsArgsObjectSchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountRolesArgsObjectSchema)]).optional(),
  posOrgComposition: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountPosOrgCompositionArgsObjectSchema)]).optional(),
  children: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountChildrenArgsObjectSchema)]).optional(),
  ancestorClosures: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountAncestorClosuresArgsObjectSchema)]).optional(),
  descendantClosures: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountDescendantClosuresArgsObjectSchema)]).optional(),
  privilegeDelegations: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeCountPrivilegeDelegationsArgsObjectSchema)]).optional()
}).strict();
export const OrganizationCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.OrganizationCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCountOutputTypeSelect>;
export const OrganizationCountOutputTypeSelectObjectZodSchema = makeSchema();
