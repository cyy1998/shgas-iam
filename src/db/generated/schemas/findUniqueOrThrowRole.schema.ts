import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './objects/RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';

export const RoleFindUniqueOrThrowSchema: z.ZodType<Prisma.RoleFindUniqueOrThrowArgs> = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleFindUniqueOrThrowArgs>;

export const RoleFindUniqueOrThrowZodSchema = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema }).strict();