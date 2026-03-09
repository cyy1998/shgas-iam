import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserArgsObjectSchema as UserArgsObjectSchema } from './UserArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { DelegationDetailFindManySchema as DelegationDetailFindManySchema } from '../findManyDelegationDetail.schema';
import { PrivilegeDelegationCountOutputTypeArgsObjectSchema as PrivilegeDelegationCountOutputTypeArgsObjectSchema } from './PrivilegeDelegationCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  delegatorUserId: z.boolean().optional(),
  delegateeUserId: z.boolean().optional(),
  organizationScopeId: z.boolean().optional(),
  startTime: z.boolean().optional(),
  endTime: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  delegatorUser: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  delegateeUser: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  organizationScope: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  delegationDetails: z.union([z.boolean(), z.lazy(() => DelegationDetailFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeDelegationSelectObjectSchema: z.ZodType<Prisma.PrivilegeDelegationSelect> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationSelect>;
export const PrivilegeDelegationSelectObjectZodSchema = makeSchema();
