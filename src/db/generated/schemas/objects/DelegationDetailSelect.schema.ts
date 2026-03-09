import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationArgsObjectSchema as PrivilegeDelegationArgsObjectSchema } from './PrivilegeDelegationArgs.schema';
import { PrivilegeArgsObjectSchema as PrivilegeArgsObjectSchema } from './PrivilegeArgs.schema'

const makeSchema = () => z.object({
  delegationId: z.boolean().optional(),
  privilegeId: z.boolean().optional(),
  delegation: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationArgsObjectSchema)]).optional(),
  privilege: z.union([z.boolean(), z.lazy(() => PrivilegeArgsObjectSchema)]).optional()
}).strict();
export const DelegationDetailSelectObjectSchema: z.ZodType<Prisma.DelegationDetailSelect> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailSelect>;
export const DelegationDetailSelectObjectZodSchema = makeSchema();
