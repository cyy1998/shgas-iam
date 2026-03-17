import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateWithoutDescendantInputObjectSchema as OrganizationClosureCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutDescendantInput.schema';
import { OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema as OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateOrConnectWithoutDescendantInput.schema';
import { OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema as OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema } from './OrganizationClosureCreateManyDescendantInputEnvelope.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema).array(), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationClosureCreateNestedManyWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateNestedManyWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateNestedManyWithoutDescendantInput>;
export const OrganizationClosureCreateNestedManyWithoutDescendantInputObjectZodSchema = makeSchema();
