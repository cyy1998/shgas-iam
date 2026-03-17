import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const PositionRoleIncludeObjectSchema: z.ZodType<Prisma.PositionRoleInclude> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleInclude>;
export const PositionRoleIncludeObjectZodSchema = makeSchema();
