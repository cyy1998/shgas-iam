import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientUncheckedCreateInputObjectSchema as ClientUncheckedCreateInputObjectSchema } from './objects/ClientUncheckedCreateInput.schema';

export const ClientCreateOneSchema: z.ZodType<Prisma.ClientCreateArgs> = z.object({   data: ClientUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientCreateArgs>;

export const ClientCreateOneZodSchema = z.object({   data: ClientUncheckedCreateInputObjectSchema }).strict();