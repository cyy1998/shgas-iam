import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientFindUniqueSchema: z.ZodType<Prisma.ClientFindUniqueArgs> = z.object({   where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientFindUniqueArgs>;

export const ClientFindUniqueZodSchema = z.object({   where: ClientWhereUniqueInputObjectSchema }).strict();