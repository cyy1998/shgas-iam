import { sql } from "drizzle-orm";
import {
  check,
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";

export const subjectAccessTransitionStatuses = [
  "pending",
  "committed",
  "rolled_back",
] as const;
export type SubjectAccessTransitionStatus
  = typeof subjectAccessTransitionStatuses[number];

export const subjectAccessTransitionTargets = [
  "enabled",
  "disabled",
  "rollback",
] as const;
export type SubjectAccessTransitionTarget
  = typeof subjectAccessTransitionTargets[number];

export const subjectAccessTransitions = snakeCase.table(
  "subject_access_transition",
  {
    id: uuid().primaryKey(),
    subjectIdentifier: uuid().notNull(),
    ownerToken: uuid().notNull(),
    status: text()
      .$type<SubjectAccessTransitionStatus>()
      .notNull()
      .default("pending"),
    targetState: text().$type<SubjectAccessTransitionTarget>(),
    createTime: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updateTime: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check(
      "subject_access_transition_state_check",
      sql`${table.status} in ('pending', 'committed', 'rolled_back')`,
    ),
    check(
      "subject_access_transition_target_check",
      sql`(
        (${table.status} = 'pending' and ${table.targetState} is null)
        or (
          ${table.status} = 'committed'
          and ${table.targetState} is not null
          and ${table.targetState} in ('enabled', 'disabled', 'rollback')
        )
        or (
          ${table.status} = 'rolled_back'
          and ${table.targetState} is not null
          and ${table.targetState} = 'rollback'
        )
      )`,
    ),
    uniqueIndex("subject_access_transition_pending_subject_idx")
      .on(table.subjectIdentifier)
      .where(sql`${table.status} = 'pending'`),
    index("subject_access_transition_pending_update_time_idx")
      .on(table.updateTime, table.id)
      .where(sql`
        ${table.status} = 'pending'
        and ${table.targetState} is null
      `),
  ],
);

export const selectSubjectAccessTransitionSchema = createSelectSchema(
  subjectAccessTransitions,
  {
    status: () => z.enum(subjectAccessTransitionStatuses),
    targetState: () => z.enum(subjectAccessTransitionTargets).nullable(),
  },
);
export const insertSubjectAccessTransitionSchema = createInsertSchema(
  subjectAccessTransitions,
  {
    status: () => z.enum(subjectAccessTransitionStatuses),
    targetState: () => z.enum(subjectAccessTransitionTargets).nullable(),
  },
).omit({
  createTime: true,
  updateTime: true,
});
export const updateSubjectAccessTransitionSchema = createUpdateSchema(
  subjectAccessTransitions,
  {
    status: () => z.enum(subjectAccessTransitionStatuses),
    targetState: () => z.enum(subjectAccessTransitionTargets).nullable(),
  },
).omit({
  id: true,
  subjectIdentifier: true,
  ownerToken: true,
  createTime: true,
});

export type SubjectAccessTransitionRow = z.infer<
  typeof selectSubjectAccessTransitionSchema
>;
