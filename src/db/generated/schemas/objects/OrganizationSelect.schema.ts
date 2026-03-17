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
  id: z.boolean().optional(),
  orgCode: z.boolean().optional(),
  orgName: z.boolean().optional(),
  parentId: z.boolean().optional(),
  businessParentId: z.boolean().optional(),
  path: z.boolean().optional(),
  level: z.boolean().optional(),
  orgType: z.boolean().optional(),
  orderNum: z.boolean().optional(),
  isVirtual: z.boolean().optional(),
  isEntity: z.boolean().optional(),
  status: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
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
export const OrganizationSelectObjectSchema: z.ZodType<Prisma.OrganizationSelect> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationSelect>;
export const OrganizationSelectObjectZodSchema = makeSchema();
