import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleFindUniqueOrThrowSchema: z.ZodType<Prisma.PosOrgRoleFindUniqueOrThrowArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleFindUniqueOrThrowArgs>;

export const PosOrgRoleFindUniqueOrThrowZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();