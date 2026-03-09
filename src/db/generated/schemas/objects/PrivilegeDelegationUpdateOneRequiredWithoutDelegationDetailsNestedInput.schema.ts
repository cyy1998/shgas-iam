import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUpsertWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUpsertWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUpsertWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema).optional(),
  upsert: z.lazy(() => PrivilegeDelegationUpsertWithoutDelegationDetailsInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema)]).optional()
}).strict();
export const PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput>;
export const PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectZodSchema = makeSchema();
