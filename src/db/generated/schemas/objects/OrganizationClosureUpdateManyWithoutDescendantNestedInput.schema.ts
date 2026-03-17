import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateWithoutDescendantInputObjectSchema as OrganizationClosureCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutDescendantInput.schema';
import { OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema as OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateOrConnectWithoutDescendantInput.schema';
import { OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectSchema as OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectSchema } from './OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInput.schema';
import { OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema as OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema } from './OrganizationClosureCreateManyDescendantInputEnvelope.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectSchema as OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectSchema } from './OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInput.schema';
import { OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectSchema as OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectSchema } from './OrganizationClosureUpdateManyWithWhereWithoutDescendantInput.schema';
import { OrganizationClosureScalarWhereInputObjectSchema as OrganizationClosureScalarWhereInputObjectSchema } from './OrganizationClosureScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema).array(), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema), z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationClosureUpdateManyWithoutDescendantNestedInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateManyWithoutDescendantNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateManyWithoutDescendantNestedInput>;
export const OrganizationClosureUpdateManyWithoutDescendantNestedInputObjectZodSchema = makeSchema();
