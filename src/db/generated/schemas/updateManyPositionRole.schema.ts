import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionRoleUpdateManyMutationInputObjectSchema as PositionRoleUpdateManyMutationInputObjectSchema } from './objects/PositionRoleUpdateManyMutationInput.schema';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './objects/PositionRoleWhereInput.schema';

export const PositionRoleUpdateManySchema: z.ZodType<Prisma.PositionRoleUpdateManyArgs> = z.object({ data: PositionRoleUpdateManyMutationInputObjectSchema, where: PositionRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PositionRoleUpdateManyArgs>;

export const PositionRoleUpdateManyZodSchema = z.object({ data: PositionRoleUpdateManyMutationInputObjectSchema, where: PositionRoleWhereInputObjectSchema.optional() }).strict();