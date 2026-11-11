CREATE TABLE "role_inclusion" (
	"container_role_id" integer,
	"member_role_id" integer,
	CONSTRAINT "role_inclusion_pkey" PRIMARY KEY("container_role_id","member_role_id"),
	CONSTRAINT "role_inclusion_distinct_roles_check" CHECK ("container_role_id" <> "member_role_id")
);
--> statement-breakpoint
CREATE INDEX "role_inclusion_member_role_id_idx" ON "role_inclusion" ("member_role_id");--> statement-breakpoint
ALTER TABLE "role_inclusion" ADD CONSTRAINT "role_inclusion_container_role_id_role_id_fkey" FOREIGN KEY ("container_role_id") REFERENCES "role"("id");--> statement-breakpoint
ALTER TABLE "role_inclusion" ADD CONSTRAINT "role_inclusion_member_role_id_role_id_fkey" FOREIGN KEY ("member_role_id") REFERENCES "role"("id");