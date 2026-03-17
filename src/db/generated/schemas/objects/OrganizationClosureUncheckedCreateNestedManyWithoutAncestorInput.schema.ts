import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateWithoutAncestorInputObjectSchema as OrganizationClosureCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutAncestorInput.schema';
import { OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema as OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateOrConnectWithoutAncestorInput.schema';
import { OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema as OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema } from './OrganizationClosureCreateManyAncestorInputEnvelope.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema).array(), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInput>;
export const OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInputObjectZodSchema = makeSchema();
