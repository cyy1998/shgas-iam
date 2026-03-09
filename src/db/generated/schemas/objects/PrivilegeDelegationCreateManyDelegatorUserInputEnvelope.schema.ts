import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateManyDelegatorUserInputObjectSchema as PrivilegeDelegationCreateManyDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateManyDelegatorUserInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PrivilegeDelegationCreateManyDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateManyDelegatorUserInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegatorUserInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegatorUserInputEnvelope>;
export const PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectZodSchema = makeSchema();
