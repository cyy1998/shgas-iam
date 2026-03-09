import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientFindUniqueSchema: z.ZodType<Prisma.ClientFindUniqueArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientFindUniqueArgs>;

export const ClientFindUniqueZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict();