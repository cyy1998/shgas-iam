import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutParentInputObjectSchema as OrganizationCreateWithoutParentInputObjectSchema } from './OrganizationCreateWithoutParentInput.schema';
import { OrganizationUncheckedCreateWithoutParentInputObjectSchema as OrganizationUncheckedCreateWithoutParentInputObjectSchema } from './OrganizationUncheckedCreateWithoutParentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutParentInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutParentInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutParentInput>;
export const OrganizationCreateOrConnectWithoutParentInputObjectZodSchema = makeSchema();
