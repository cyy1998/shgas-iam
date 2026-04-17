import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureUncheckedCreateInputObjectSchema as OrganizationClosureUncheckedCreateInputObjectSchema } from './objects/OrganizationClosureUncheckedCreateInput.schema';

export const OrganizationClosureCreateOneSchema: z.ZodType<Prisma.OrganizationClosureCreateArgs> = z.object({   data: OrganizationClosureUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureCreateArgs>;

export const OrganizationClosureCreateOneZodSchema = z.object({   data: OrganizationClosureUncheckedCreateInputObjectSchema }).strict();