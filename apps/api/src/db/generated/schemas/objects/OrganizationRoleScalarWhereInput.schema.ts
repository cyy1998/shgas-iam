import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema'

const organizationrolescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema).array()]).optional(),
  organizationId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isAllSub: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional()
}).strict();
export const OrganizationRoleScalarWhereInputObjectSchema: z.ZodType<Prisma.OrganizationRoleScalarWhereInput> = organizationrolescalarwhereinputSchema as unknown as z.ZodType<Prisma.OrganizationRoleScalarWhereInput>;
export const OrganizationRoleScalarWhereInputObjectZodSchema = organizationrolescalarwhereinputSchema;
