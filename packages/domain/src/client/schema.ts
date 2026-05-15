import { z } from "@hono/zod-openapi";
import { selectClientSchema } from "@iam/db/schema";

export const ClientDtoSchema = z.object(selectClientSchema.shape).openapi("ClientDto");
