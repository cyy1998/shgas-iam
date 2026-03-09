import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserArgsObjectSchema as UserArgsObjectSchema } from './UserArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { DelegationDetailFindManySchema as DelegationDetailFindManySchema } from '../findManyDelegationDetail.schema';
import { PrivilegeDelegationCountOutputTypeArgsObjectSchema as PrivilegeDelegationCountOutputTypeArgsObjectSchema } from './PrivilegeDelegationCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  delegatorUser: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  delegateeUser: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  organizationScope: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  delegationDetails: z.union([z.boolean(), z.lazy(() => DelegationDetailFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeDelegationIncludeObjectSchema: z.ZodType<Prisma.PrivilegeDelegationInclude> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationInclude>;
export const PrivilegeDelegationIncludeObjectZodSchema = makeSchema();
