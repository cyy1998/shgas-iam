import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientDeleteOneSchema: z.ZodType<Prisma.ClientDeleteArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientDeleteArgs>;

export const ClientDeleteOneZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict();