import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationRoleCreateManyInputObjectSchema as OrganizationRoleCreateManyInputObjectSchema } from './objects/OrganizationRoleCreateManyInput.schema';

export const OrganizationRoleCreateManySchema: z.ZodType<Prisma.OrganizationRoleCreateManyArgs> = z.object({ data: z.union([ OrganizationRoleCreateManyInputObjectSchema, z.array(OrganizationRoleCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyArgs>;

export const OrganizationRoleCreateManyZodSchema = z.object({ data: z.union([ OrganizationRoleCreateManyInputObjectSchema, z.array(OrganizationRoleCreateManyInputObjectSchema) ]),  }).strict();