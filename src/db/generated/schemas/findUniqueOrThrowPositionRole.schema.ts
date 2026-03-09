import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './objects/PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';

export const PositionRoleFindUniqueOrThrowSchema: z.ZodType<Prisma.PositionRoleFindUniqueOrThrowArgs> = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionRoleFindUniqueOrThrowArgs>;

export const PositionRoleFindUniqueOrThrowZodSchema = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema }).strict();