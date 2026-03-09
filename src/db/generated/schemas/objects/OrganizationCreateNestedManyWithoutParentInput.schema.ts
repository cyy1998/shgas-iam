import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutParentInputObjectSchema as OrganizationCreateWithoutParentInputObjectSchema } from './OrganizationCreateWithoutParentInput.schema';
import { OrganizationUncheckedCreateWithoutParentInputObjectSchema as OrganizationUncheckedCreateWithoutParentInputObjectSchema } from './OrganizationUncheckedCreateWithoutParentInput.schema';
import { OrganizationCreateOrConnectWithoutParentInputObjectSchema as OrganizationCreateOrConnectWithoutParentInputObjectSchema } from './OrganizationCreateOrConnectWithoutParentInput.schema';
import { OrganizationCreateManyParentInputEnvelopeObjectSchema as OrganizationCreateManyParentInputEnvelopeObjectSchema } from './OrganizationCreateManyParentInputEnvelope.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema).array(), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationCreateOrConnectWithoutParentInputObjectSchema), z.lazy(() => OrganizationCreateOrConnectWithoutParentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationCreateManyParentInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => OrganizationWhereUniqueInputObjectSchema), z.lazy(() => OrganizationWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationCreateNestedManyWithoutParentInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedManyWithoutParentInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedManyWithoutParentInput>;
export const OrganizationCreateNestedManyWithoutParentInputObjectZodSchema = makeSchema();
