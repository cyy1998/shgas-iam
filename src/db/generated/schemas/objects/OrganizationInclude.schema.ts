import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { OrganizationRoleFindManySchema as OrganizationRoleFindManySchema } from '../findManyOrganizationRole.schema';
import { PosOrgCompositionFindManySchema as PosOrgCompositionFindManySchema } from '../findManyPosOrgComposition.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { OrganizationFindManySchema as OrganizationFindManySchema } from '../findManyOrganization.schema';
import { OrganizationClosureFindManySchema as OrganizationClosureFindManySchema } from '../findManyOrganizationClosure.schema';
import { PrivilegeDelegationFindManySchema as PrivilegeDelegationFindManySchema } from '../findManyPrivilegeDelegation.schema';
import { OrganizationCountOutputTypeArgsObjectSchema as OrganizationCountOutputTypeArgsObjectSchema } from './OrganizationCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  deptEmployments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  compEmployments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => OrganizationRoleFindManySchema)]).optional(),
  posOrgComposition: z.union([z.boolean(), z.lazy(() => PosOrgCompositionFindManySchema)]).optional(),
  parent: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  children: z.union([z.boolean(), z.lazy(() => OrganizationFindManySchema)]).optional(),
  ancestorClosures: z.union([z.boolean(), z.lazy(() => OrganizationClosureFindManySchema)]).optional(),
  descendantClosures: z.union([z.boolean(), z.lazy(() => OrganizationClosureFindManySchema)]).optional(),
  privilegeDelegations: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => OrganizationCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const OrganizationIncludeObjectSchema: z.ZodType<Prisma.OrganizationInclude> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationInclude>;
export const OrganizationIncludeObjectZodSchema = makeSchema();
