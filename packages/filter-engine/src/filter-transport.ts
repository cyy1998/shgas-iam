import { z } from "zod";
import {
  FILTER_MAX_CHILDREN,
  FILTER_MAX_RAW_VALUES,
  FILTER_OPERATORS,
  findFilterBudgetViolation,
} from "./filter-engine";
import { FILTER_MAX_STRING_LENGTH } from "./structure";

interface FilterTransportSchemaOptions {
  /** Recursive references use the returned schema, including caller-owned protocol metadata. */
  readonly annotateExpression?: (schema: z.ZodType<unknown>) => z.ZodType<unknown>;
}

export function createFilterTransportSchemas(options: FilterTransportSchemaOptions = {}) {
  const scalarValueSchema = z.union([z.string().max(FILTER_MAX_STRING_LENGTH), z.number(), z.boolean()]);
  const conditionValueSchema = z.union([
    scalarValueSchema,
    z.array(scalarValueSchema).min(1).max(FILTER_MAX_RAW_VALUES),
  ]);
  const annotateExpression = options.annotateExpression ?? ((schema: z.ZodType<unknown>) => schema);
  const expressionSchema: z.ZodType<unknown> = annotateExpression(
    z.lazy(() =>
      z.union([
        z.object({ and: z.array(expressionSchema).min(1).max(FILTER_MAX_CHILDREN) }).strict(),
        z.object({ or: z.array(expressionSchema).min(1).max(FILTER_MAX_CHILDREN) }).strict(),
        z.object({ not: expressionSchema }).strict(),
        z.object({ exists: z.object({ path: z.string().min(1), where: expressionSchema }).strict() }).strict(),
        z.object({ field: z.string().min(1), op: z.enum(FILTER_OPERATORS), value: conditionValueSchema }).strict(),
      ]),
    ),
  );
  const budgetedSchema = z.preprocess((input, context) => {
    const violation = findFilterBudgetViolation(input);
    if (violation === null) return input;
    context.addIssue({ code: "custom", message: violation });
    return z.NEVER;
  }, expressionSchema);
  return { expressionSchema, budgetedSchema };
}
