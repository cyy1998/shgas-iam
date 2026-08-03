CREATE TABLE "subject_access_transition" (
	"id" uuid PRIMARY KEY,
	"subject_identifier" uuid NOT NULL,
	"owner_token" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_state" text,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_access_transition_state_check" CHECK ("status" in ('pending', 'committed', 'rolled_back')),
	CONSTRAINT "subject_access_transition_target_check" CHECK ((
        ("status" = 'pending' and "target_state" is null)
        or (
          "status" = 'committed'
          and "target_state" in ('enabled', 'disabled', 'rollback')
        )
        or (
          "status" = 'rolled_back'
          and "target_state" = 'rollback'
        )
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subject_access_transition_pending_subject_idx" ON "subject_access_transition" ("subject_identifier") WHERE "status" = 'pending';