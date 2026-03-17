import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateManyRoleInputObjectSchema as OrganizationRoleCreateManyRoleInputObjectSchema } from './OrganizationRoleCreateManyRoleInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => OrganizationRoleCreateManyRoleInputObjectSchema), z.lazy(() => OrganizationRoleCreateManyRoleInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateManyRoleInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyRoleInputEnvelope>;
export const OrganizationRoleCreateManyRoleInputEnvelopeObjectZodSchema = makeSchema();
