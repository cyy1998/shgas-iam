import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateManyDelegateeUserInputObjectSchema as PrivilegeDelegationCreateManyDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateManyDelegateeUserInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PrivilegeDelegationCreateManyDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateManyDelegateeUserInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegateeUserInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegateeUserInputEnvelope>;
export const PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectZodSchema = makeSchema();
