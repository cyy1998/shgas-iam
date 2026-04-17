import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleUncheckedCreateInputObjectSchema as OrganizationRoleUncheckedCreateInputObjectSchema } from './objects/OrganizationRoleUncheckedCreateInput.schema';

export const OrganizationRoleCreateOneSchema: z.ZodType<Prisma.OrganizationRoleCreateArgs> = z.object({   data: OrganizationRoleUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleCreateArgs>;

export const OrganizationRoleCreateOneZodSchema = z.object({   data: OrganizationRoleUncheckedCreateInputObjectSchema }).strict();