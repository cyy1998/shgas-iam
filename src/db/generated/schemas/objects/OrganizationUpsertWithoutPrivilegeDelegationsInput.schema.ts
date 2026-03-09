import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUpdateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutPrivilegeDelegationsInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutPrivilegeDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutPrivilegeDelegationsInput>;
export const OrganizationUpsertWithoutPrivilegeDelegationsInputObjectZodSchema = makeSchema();
