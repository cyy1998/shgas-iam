import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateWithoutAncestorInputObjectSchema as OrganizationClosureCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutAncestorInput.schema';
import { OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema as OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateOrConnectWithoutAncestorInput.schema';
import { OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectSchema as OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectSchema } from './OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInput.schema';
import { OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema as OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema } from './OrganizationClosureCreateManyAncestorInputEnvelope.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectSchema as OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectSchema } from './OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInput.schema';
import { OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectSchema as OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectSchema } from './OrganizationClosureUpdateManyWithWhereWithoutAncestorInput.schema';
import { OrganizationClosureScalarWhereInputObjectSchema as OrganizationClosureScalarWhereInputObjectSchema } from './OrganizationClosureScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema).array(), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInput>;
export const OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInputObjectZodSchema = makeSchema();
