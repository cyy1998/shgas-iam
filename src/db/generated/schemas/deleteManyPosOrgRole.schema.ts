import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './objects/PosOrgRoleWhereInput.schema';

export const PosOrgRoleDeleteManySchema: z.ZodType<Prisma.PosOrgRoleDeleteManyArgs> = z.object({ where: PosOrgRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleDeleteManyArgs>;

export const PosOrgRoleDeleteManyZodSchema = z.object({ where: PosOrgRoleWhereInputObjectSchema.optional() }).strict();