import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './objects/ClientWhereInput.schema';

export const ClientDeleteManySchema: z.ZodType<Prisma.ClientDeleteManyArgs> = z.object({ where: ClientWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.ClientDeleteManyArgs>;

export const ClientDeleteManyZodSchema = z.object({ where: ClientWhereInputObjectSchema.optional() }).strict();