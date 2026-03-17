import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionCreateManyInputObjectSchema as PosOrgCompositionCreateManyInputObjectSchema } from './objects/PosOrgCompositionCreateManyInput.schema';

export const PosOrgCompositionCreateManySchema: z.ZodType<Prisma.PosOrgCompositionCreateManyArgs> = z.object({ data: z.union([ PosOrgCompositionCreateManyInputObjectSchema, z.array(PosOrgCompositionCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyArgs>;

export const PosOrgCompositionCreateManyZodSchema = z.object({ data: z.union([ PosOrgCompositionCreateManyInputObjectSchema, z.array(PosOrgCompositionCreateManyInputObjectSchema) ]),  }).strict();