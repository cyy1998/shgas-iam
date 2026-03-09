import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';
import { ClientCreateInputObjectSchema as ClientCreateInputObjectSchema } from './objects/ClientCreateInput.schema';
import { ClientUncheckedCreateInputObjectSchema as ClientUncheckedCreateInputObjectSchema } from './objects/ClientUncheckedCreateInput.schema';
import { ClientUpdateInputObjectSchema as ClientUpdateInputObjectSchema } from './objects/ClientUpdateInput.schema';
import { ClientUncheckedUpdateInputObjectSchema as ClientUncheckedUpdateInputObjectSchema } from './objects/ClientUncheckedUpdateInput.schema';

export const ClientUpsertOneSchema: z.ZodType<Prisma.ClientUpsertArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema, create: z.union([ ClientCreateInputObjectSchema, ClientUncheckedCreateInputObjectSchema ]), update: z.union([ ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.ClientUpsertArgs>;

export const ClientUpsertOneZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema, create: z.union([ ClientCreateInputObjectSchema, ClientUncheckedCreateInputObjectSchema ]), update: z.union([ ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema ]) }).strict();