import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleFindUniqueSchema: z.ZodType<Prisma.PosOrgRoleFindUniqueArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleFindUniqueArgs>;

export const PosOrgRoleFindUniqueZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();