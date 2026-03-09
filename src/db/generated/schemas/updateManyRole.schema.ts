import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RoleUpdateManyMutationInputObjectSchema as RoleUpdateManyMutationInputObjectSchema } from './objects/RoleUpdateManyMutationInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './objects/RoleWhereInput.schema';

export const RoleUpdateManySchema: z.ZodType<Prisma.RoleUpdateManyArgs> = z.object({ data: RoleUpdateManyMutationInputObjectSchema, where: RoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.RoleUpdateManyArgs>;

export const RoleUpdateManyZodSchema = z.object({ data: RoleUpdateManyMutationInputObjectSchema, where: RoleWhereInputObjectSchema.optional() }).strict();