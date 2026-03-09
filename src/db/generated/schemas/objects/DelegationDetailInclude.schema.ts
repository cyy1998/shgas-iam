import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationArgsObjectSchema as PrivilegeDelegationArgsObjectSchema } from './PrivilegeDelegationArgs.schema';
import { PrivilegeArgsObjectSchema as PrivilegeArgsObjectSchema } from './PrivilegeArgs.schema'

const makeSchema = () => z.object({
  delegation: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationArgsObjectSchema)]).optional(),
  privilege: z.union([z.boolean(), z.lazy(() => PrivilegeArgsObjectSchema)]).optional()
}).strict();
export const DelegationDetailIncludeObjectSchema: z.ZodType<Prisma.DelegationDetailInclude> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailInclude>;
export const DelegationDetailIncludeObjectZodSchema = makeSchema();
