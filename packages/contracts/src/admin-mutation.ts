import { z } from "zod";

export function createAdminMutationResultSchema<T extends z.ZodType>(result: T) {
  return z.object({ changed: z.boolean(), result });
}

export type AdminMutationResult<T> = z.infer<ReturnType<typeof createAdminMutationResultSchema<z.ZodType<T>>>>;
