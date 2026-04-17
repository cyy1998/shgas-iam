import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  orgCode: z.string().optional()
}).strict();
export const OrganizationWhereUniqueInputObjectSchema: z.ZodType<Prisma.OrganizationWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationWhereUniqueInput>;
export const OrganizationWhereUniqueInputObjectZodSchema = makeSchema();
