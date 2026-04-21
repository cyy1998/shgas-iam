import type { z } from "zod";
import { mapCustomErrorToTRPCError, publicProcedure } from "@/trpc/trpc";
import * as resp from "@/utils/http/response";

type OpKind = "query" | "mutation";

export type BusinessOp<TSchema extends z.ZodTypeAny, TOutput> = {
  input: TSchema;
  kind: OpKind;
  handler: (input: z.infer<TSchema>) => Promise<TOutput>;
};

type InferInput<TSchema extends z.ZodTypeAny> = z.infer<TSchema>;

export function defineOp<TSchema extends z.ZodTypeAny, TOutput>(
  op: BusinessOp<TSchema, TOutput>,
) {
  const toTRPC = () => {
    const proc = publicProcedure.input(op.input);
    const resolver = async (opts: { input: unknown }) => {
      try {
        return await op.handler(opts.input as InferInput<TSchema>);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    };
    return op.kind === "query" ? proc.query(resolver) : proc.mutation(resolver);
  };

  const run = async (input: InferInput<TSchema>) => {
    const data = await op.handler(input);
    return resp.ok(data);
  };

  return {
    ...op,
    toTRPC,
    run,
  };
}
