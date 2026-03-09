import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutDescendantClosuresInputObjectSchema as OrganizationCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutDescendantClosuresInput.schema';
import { OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema as OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateOrConnectWithoutDescendantClosuresInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutDescendantClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutDescendantClosuresInput>;
export const OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectZodSchema = makeSchema();
