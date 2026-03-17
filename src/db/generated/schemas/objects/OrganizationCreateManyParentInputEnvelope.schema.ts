import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateManyParentInputObjectSchema as OrganizationCreateManyParentInputObjectSchema } from './OrganizationCreateManyParentInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => OrganizationCreateManyParentInputObjectSchema), z.lazy(() => OrganizationCreateManyParentInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const OrganizationCreateManyParentInputEnvelopeObjectSchema: z.ZodType<Prisma.OrganizationCreateManyParentInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateManyParentInputEnvelope>;
export const OrganizationCreateManyParentInputEnvelopeObjectZodSchema = makeSchema();
