import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientUpdateInputObjectSchema as ClientUpdateInputObjectSchema } from './objects/ClientUpdateInput.schema';
import { ClientUncheckedUpdateInputObjectSchema as ClientUncheckedUpdateInputObjectSchema } from './objects/ClientUncheckedUpdateInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientUpdateOneSchema: z.ZodType<Prisma.ClientUpdateArgs> = z.object({   data: z.union([ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema]), where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientUpdateArgs>;

export const ClientUpdateOneZodSchema = z.object({   data: z.union([ClientUpdateInputObjectSchema, ClientUncheckedUpdateInputObjectSchema]), where: ClientWhereUniqueInputObjectSchema }).strict();