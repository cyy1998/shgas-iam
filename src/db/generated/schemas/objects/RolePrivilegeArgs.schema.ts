import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeSelectObjectSchema as RolePrivilegeSelectObjectSchema } from './RolePrivilegeSelect.schema';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './RolePrivilegeInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => RolePrivilegeSelectObjectSchema).optional(),
  include: z.lazy(() => RolePrivilegeIncludeObjectSchema).optional()
}).strict();
export const RolePrivilegeArgsObjectSchema = makeSchema();
export const RolePrivilegeArgsObjectZodSchema = makeSchema();
