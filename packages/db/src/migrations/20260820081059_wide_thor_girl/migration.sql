CREATE TABLE "organization_responsibility_assignment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_responsibility_assignment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employment_id" integer NOT NULL,
	"type_code" text NOT NULL,
	"target_organization_id" integer NOT NULL,
	"status" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_responsibility_assignment_type_code_check" CHECK ("type_code" IN (
        'head',
        'supervising'
      )),
	CONSTRAINT "organization_responsibility_assignment_status_check" CHECK ("status" IN (
        1,
        2,
        3
      )),
	CONSTRAINT "organization_responsibility_assignment_period_check" CHECK ((
        "status" IN (
          1,
          2
        )
        AND "end_time" IS NULL
      ) OR (
        "status" = 3
        AND "end_time" IS NOT NULL
        AND "end_time" >= "start_time"
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_resp_assignment_open_head_unique_idx" ON "organization_responsibility_assignment" ("target_organization_id","type_code") WHERE
        "type_code" = 'head'
        AND "status" IN (
          1,
          2
        )
      ;--> statement-breakpoint
CREATE UNIQUE INDEX "org_resp_assignment_open_supervising_unique_idx" ON "organization_responsibility_assignment" ("target_organization_id","type_code","employment_id") WHERE
        "type_code" = 'supervising'
        AND "status" IN (
          1,
          2
        )
      ;--> statement-breakpoint
CREATE INDEX "organization_responsibility_assignment_employment_id_idx" ON "organization_responsibility_assignment" ("employment_id");
