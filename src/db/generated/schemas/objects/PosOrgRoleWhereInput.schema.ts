import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const posorgrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgRoleWhereInputObjectSchema), z.lazy(() => PosOrgRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgRoleWhereInputObjectSchema), z.lazy(() => PosOrgRoleWhereInputObjectSchema).array()]).optional(),
  posOrgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PosOrgRoleWhereInputObjectSchema: z.ZodType<Prisma.PosOrgRoleWhereInput> = posorgrolewhereinputSchema as unknown as z.ZodType<Prisma.PosOrgRoleWhereInput>;
export const PosOrgRoleWhereInputObjectZodSchema = posorgrolewhereinputSchema;
