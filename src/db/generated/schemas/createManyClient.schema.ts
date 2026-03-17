import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientCreateManyInputObjectSchema as ClientCreateManyInputObjectSchema } from './objects/ClientCreateManyInput.schema';

export const ClientCreateManySchema: z.ZodType<Prisma.ClientCreateManyArgs> = z.object({ data: z.union([ ClientCreateManyInputObjectSchema, z.array(ClientCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.ClientCreateManyArgs>;

export const ClientCreateManyZodSchema = z.object({ data: z.union([ ClientCreateManyInputObjectSchema, z.array(ClientCreateManyInputObjectSchema) ]),  }).strict();