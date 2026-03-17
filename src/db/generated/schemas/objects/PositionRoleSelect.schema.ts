import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  positionId: z.boolean().optional(),
  roleId: z.boolean().optional(),
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const PositionRoleSelectObjectSchema: z.ZodType<Prisma.PositionRoleSelect> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleSelect>;
export const PositionRoleSelectObjectZodSchema = makeSchema();
