import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientUpdateManyMutationInputObjectSchema as ClientUpdateManyMutationInputObjectSchema } from './objects/ClientUpdateManyMutationInput.schema';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './objects/ClientWhereInput.schema';

export const ClientUpdateManySchema: z.ZodType<Prisma.ClientUpdateManyArgs> = z.object({ data: ClientUpdateManyMutationInputObjectSchema, where: ClientWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.ClientUpdateManyArgs>;

export const ClientUpdateManyZodSchema = z.object({ data: ClientUpdateManyMutationInputObjectSchema, where: ClientWhereInputObjectSchema.optional() }).strict();