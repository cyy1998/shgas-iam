import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './objects/OrganizationWhereUniqueInput.schema';

export const OrganizationDeleteOneSchema: z.ZodType<Prisma.OrganizationDeleteArgs> = z.object({   where: OrganizationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationDeleteArgs>;

export const OrganizationDeleteOneZodSchema = z.object({   where: OrganizationWhereUniqueInputObjectSchema }).strict();