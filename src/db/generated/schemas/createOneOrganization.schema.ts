import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationUncheckedCreateInputObjectSchema as OrganizationUncheckedCreateInputObjectSchema } from './objects/OrganizationUncheckedCreateInput.schema';

export const OrganizationCreateOneSchema: z.ZodType<Prisma.OrganizationCreateArgs> = z.object({   data: OrganizationUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationCreateArgs>;

export const OrganizationCreateOneZodSchema = z.object({   data: OrganizationUncheckedCreateInputObjectSchema }).strict();