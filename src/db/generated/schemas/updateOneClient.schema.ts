import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientUpdateInputObjectSchema as ClientUpdateInputObjectSchema } from './objects/ClientUpdateInput.schema';
import { ClientUncheckedUpdateInputObjectSchema as ClientUncheckedUpdateInputObjectSchema } from './objects/ClientUncheckedUpdateInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientUpdateOneSchema: z.ZodType<Prisma.ClientUpdateArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), data: z.union([ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema]), where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientUpdateArgs>;

export const ClientUpdateOneZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), data: z.union([ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema]), where: ClientWhereUniqueInputObjectSchema }).strict();