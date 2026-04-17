import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './objects/OrganizationWhereUniqueInput.schema';

export const OrganizationFindUniqueSchema: z.ZodType<Prisma.OrganizationFindUniqueArgs> = z.object({   where: OrganizationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationFindUniqueArgs>;

export const OrganizationFindUniqueZodSchema = z.object({   where: OrganizationWhereUniqueInputObjectSchema }).strict();