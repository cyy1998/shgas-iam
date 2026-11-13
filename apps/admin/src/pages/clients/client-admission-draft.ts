import type { ClientAdmissionFilter } from "@admin/services/client-admission";
import type { ConditionScope, ConditionValue } from "./client-admission-fields";

const operatorLabels = {
  eq: "等于",
  in: "属于集合",
  containsAny: "包含任一",
  containsAll: "包含全部",
};
type Operator = keyof typeof operatorLabels;
export type ConditionKind = "field" | "and" | "or" | "not" | `exists:${string}`;

type DraftValue = { id: number; value: ConditionValue | undefined };
export type ConditionDraft = { id: number } & (
  | { kind: "field"; field: string; op: Operator; values: DraftValue[] }
  | { kind: "and" | "or" | "not"; children: ConditionDraft[] }
  | { kind: "exists"; path: string; child: ConditionDraft }
);

type Filter =
  | {
      field: string;
      op: Operator;
      value: ConditionValue | ConditionValue[];
    }
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter }
  | { exists: { path: string; where: Filter } };

let nextId = 0;

export function draftValue(value?: ConditionValue): DraftValue {
  return { id: nextId++, value };
}

export function operators(scope: ConditionScope, field: string): { label: string; value: Operator }[] {
  const allowed: Operator[] = scope.fields[field]?.collection ? ["containsAny", "containsAll"] : ["eq", "in"];
  return allowed.map((value) => ({ value, label: operatorLabels[value] }));
}

export function fieldDraft(scope: ConditionScope, field = Object.keys(scope.fields)[0]): ConditionDraft {
  if (field === undefined) throw new Error("Missing admission condition fields");
  return { id: nextId++, kind: "field", field, op: operators(scope, field)[0]!.value, values: [draftValue()] };
}

export function changeKind(kind: ConditionKind, scope: ConditionScope): ConditionDraft {
  switch (kind) {
    case "field":
      return fieldDraft(scope);
    case "and":
    case "or":
    case "not":
      return { id: nextId++, kind, children: [fieldDraft(scope)] };
    default: {
      const path = kind.slice("exists:".length);
      const collection = scope.collections[path];
      if (!collection) throw new Error("Missing admission collection scope");
      return { id: nextId++, kind: "exists", path, child: fieldDraft(collection.scope) };
    }
  }
}

export function readDraft(filter: ClientAdmissionFilter | Filter): ConditionDraft {
  const id = nextId++;
  if ("and" in filter) return { id, kind: "and", children: filter.and.map(readDraft) };
  if ("or" in filter) return { id, kind: "or", children: filter.or.map(readDraft) };
  if ("not" in filter) return { id, kind: "not", children: [readDraft(filter.not)] };
  if ("exists" in filter)
    return { id, kind: "exists", path: filter.exists.path, child: readDraft(filter.exists.where) };
  const { field, op, value } = filter;
  return { id, kind: "field", field, op, values: (Array.isArray(value) ? value : [value]).map(draftValue) };
}

export function writeFilter(draft: ConditionDraft, scope: ConditionScope): Filter | undefined {
  if (draft.kind === "field") {
    const field = scope.fields[draft.field];
    const values = draft.values.map(({ value }) => value);
    if (
      !field ||
      values.length === 0 ||
      !values.every((value): value is ConditionValue => value !== undefined && (field.validate?.(value) ?? true))
    )
      return undefined;
    const value = draft.op === "eq" ? values[0] : [...new Set(values)];
    return value === undefined ? undefined : { field: draft.field, op: draft.op, value };
  }
  if (draft.kind === "exists") {
    const collection = scope.collections[draft.path];
    const where = collection && writeFilter(draft.child, collection.scope);
    return where && { exists: { path: draft.path, where } };
  }
  const children = draft.children.map((child) => writeFilter(child, scope));
  if (children.length === 0 || !children.every((child) => child !== undefined)) return undefined;
  if (draft.kind === "not") return children[0] && { not: children[0] };
  return draft.kind === "and" ? { and: children } : { or: children };
}
