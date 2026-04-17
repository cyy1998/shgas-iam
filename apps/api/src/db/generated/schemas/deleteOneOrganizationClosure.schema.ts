import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';

export const OrganizationClosureDeleteOneSchema: z.ZodType<Prisma.OrganizationClosureDeleteArgs> = z.object({   where: OrganizationClosureWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureDeleteArgs>;

export const OrganizationClosureDeleteOneZodSchema = z.object({   where: OrganizationClosureWhereUniqueInputObjectSchema }).strict();