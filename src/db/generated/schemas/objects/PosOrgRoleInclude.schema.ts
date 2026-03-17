import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionArgsObjectSchema as PosOrgCompositionArgsObjectSchema } from './PosOrgCompositionArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  posOrg: z.union([z.boolean(), z.lazy(() => PosOrgCompositionArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const PosOrgRoleIncludeObjectSchema: z.ZodType<Prisma.PosOrgRoleInclude> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleInclude>;
export const PosOrgRoleIncludeObjectZodSchema = makeSchema();
