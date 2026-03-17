import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateManyOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateManyOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateManyOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PrivilegeDelegationCreateManyOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateManyOrganizationScopeInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyOrganizationScopeInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyOrganizationScopeInputEnvelope>;
export const PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectZodSchema = makeSchema();
