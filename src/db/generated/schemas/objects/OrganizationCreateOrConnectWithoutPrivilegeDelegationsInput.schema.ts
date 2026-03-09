import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedCreateWithoutPrivilegeDelegationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutPrivilegeDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutPrivilegeDelegationsInput>;
export const OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectZodSchema = makeSchema();
