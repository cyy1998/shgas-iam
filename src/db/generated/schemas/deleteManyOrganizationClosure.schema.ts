import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './objects/OrganizationClosureWhereInput.schema';

export const OrganizationClosureDeleteManySchema: z.ZodType<Prisma.OrganizationClosureDeleteManyArgs> = z.object({ where: OrganizationClosureWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureDeleteManyArgs>;

export const OrganizationClosureDeleteManyZodSchema = z.object({ where: OrganizationClosureWhereInputObjectSchema.optional() }).strict();