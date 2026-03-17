import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionCreateManyInputObjectSchema as PositionCreateManyInputObjectSchema } from './objects/PositionCreateManyInput.schema';

export const PositionCreateManySchema: z.ZodType<Prisma.PositionCreateManyArgs> = z.object({ data: z.union([ PositionCreateManyInputObjectSchema, z.array(PositionCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PositionCreateManyArgs>;

export const PositionCreateManyZodSchema = z.object({ data: z.union([ PositionCreateManyInputObjectSchema, z.array(PositionCreateManyInputObjectSchema) ]),  }).strict();