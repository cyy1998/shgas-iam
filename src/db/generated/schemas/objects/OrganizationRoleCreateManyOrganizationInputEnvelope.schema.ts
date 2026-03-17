import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateManyOrganizationInputObjectSchema as OrganizationRoleCreateManyOrganizationInputObjectSchema } from './OrganizationRoleCreateManyOrganizationInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => OrganizationRoleCreateManyOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleCreateManyOrganizationInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateManyOrganizationInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyOrganizationInputEnvelope>;
export const OrganizationRoleCreateManyOrganizationInputEnvelopeObjectZodSchema = makeSchema();
