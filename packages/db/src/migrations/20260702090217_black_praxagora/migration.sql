CREATE TABLE "role_assignment" (
	"id" serial PRIMARY KEY,
	"role_id" integer NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" integer NOT NULL,
	"include_descendants" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants")
SELECT "role_id", 'employment', "employment_id", false
FROM "employment_role";--> statement-breakpoint
INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants")
SELECT "role_id", 'organization', "organization_id", "is_all_sub"
FROM "organization_role";--> statement-breakpoint
INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants")
SELECT "role_id", 'position', "position_id", false
FROM "position_role";--> statement-breakpoint
DROP TABLE "employment_role";--> statement-breakpoint
DROP TABLE "organization_role";--> statement-breakpoint
DROP TABLE "position_role";--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_role_id_target_type_target_id_key" ON "role_assignment" ("role_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_role_assignment_role_id" ON "role_assignment" ("role_id");--> statement-breakpoint
CREATE INDEX "idx_role_assignment_target" ON "role_assignment" ("target_type","target_id");
