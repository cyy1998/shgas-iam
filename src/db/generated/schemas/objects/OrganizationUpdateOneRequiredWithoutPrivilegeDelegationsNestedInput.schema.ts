import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateOrConnectWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUpsertWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUpsertWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUpsertWithoutPrivilegeDelegationsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUpdateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutPrivilegeDelegationsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInput>;
export const OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInputObjectZodSchema = makeSchema();
