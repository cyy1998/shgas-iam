import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const posorgrolescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema).array()]).optional(),
  posOrgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PosOrgRoleScalarWhereInputObjectSchema: z.ZodType<Prisma.PosOrgRoleScalarWhereInput> = posorgrolescalarwhereinputSchema as unknown as z.ZodType<Prisma.PosOrgRoleScalarWhereInput>;
export const PosOrgRoleScalarWhereInputObjectZodSchema = posorgrolescalarwhereinputSchema;
