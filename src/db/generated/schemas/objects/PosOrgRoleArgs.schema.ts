import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './PosOrgRoleInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PosOrgRoleSelectObjectSchema).optional(),
  include: z.lazy(() => PosOrgRoleIncludeObjectSchema).optional()
}).strict();
export const PosOrgRoleArgsObjectSchema = makeSchema();
export const PosOrgRoleArgsObjectZodSchema = makeSchema();
