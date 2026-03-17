import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './PositionRoleInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PositionRoleSelectObjectSchema).optional(),
  include: z.lazy(() => PositionRoleIncludeObjectSchema).optional()
}).strict();
export const PositionRoleArgsObjectSchema = makeSchema();
export const PositionRoleArgsObjectZodSchema = makeSchema();
