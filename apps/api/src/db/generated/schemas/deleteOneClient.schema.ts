import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientDeleteOneSchema: z.ZodType<Prisma.ClientDeleteArgs> = z.object({   where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientDeleteArgs>;

export const ClientDeleteOneZodSchema = z.object({   where: ClientWhereUniqueInputObjectSchema }).strict();