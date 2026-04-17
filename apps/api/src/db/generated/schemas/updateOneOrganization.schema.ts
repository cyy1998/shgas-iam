import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationUpdateInputObjectSchema as OrganizationUpdateInputObjectSchema } from './objects/OrganizationUpdateInput.schema';
import { OrganizationUncheckedUpdateInputObjectSchema as OrganizationUncheckedUpdateInputObjectSchema } from './objects/OrganizationUncheckedUpdateInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './objects/OrganizationWhereUniqueInput.schema';

export const OrganizationUpdateOneSchema: z.ZodType<Prisma.OrganizationUpdateArgs> = z.object({   data: z.union([OrganizationUpdateInputObjectSchema, OrganizationUncheckedUpdateInputObjectSchema]), where: OrganizationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationUpdateArgs>;

export const OrganizationUpdateOneZodSchema = z.object({   data: z.union([OrganizationUpdateInputObjectSchema, OrganizationUncheckedUpdateInputObjectSchema]), where: OrganizationWhereUniqueInputObjectSchema }).strict();