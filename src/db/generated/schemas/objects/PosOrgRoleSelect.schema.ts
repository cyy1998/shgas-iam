import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionArgsObjectSchema as PosOrgCompositionArgsObjectSchema } from './PosOrgCompositionArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  posOrgId: z.boolean().optional(),
  roleId: z.boolean().optional(),
  posOrg: z.union([z.boolean(), z.lazy(() => PosOrgCompositionArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const PosOrgRoleSelectObjectSchema: z.ZodType<Prisma.PosOrgRoleSelect> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleSelect>;
export const PosOrgRoleSelectObjectZodSchema = makeSchema();
