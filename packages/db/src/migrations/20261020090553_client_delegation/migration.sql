CREATE TABLE "client_delegation" (
	"id" serial PRIMARY KEY,
	"delegator_user_id" integer NOT NULL,
	"delegatee_user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"organization_scope_id" integer NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "delegation_detail";--> statement-breakpoint
DROP TABLE "privilege_delegation";--> statement-breakpoint
CREATE INDEX "client_delegation_delegator_client_idx" ON "client_delegation" ("delegator_user_id","client_id");--> statement-breakpoint
CREATE INDEX "client_delegation_delegatee_idx" ON "client_delegation" ("delegatee_user_id");--> statement-breakpoint
CREATE INDEX "client_delegation_client_idx" ON "client_delegation" ("client_id");--> statement-breakpoint
CREATE INDEX "client_delegation_organization_idx" ON "client_delegation" ("organization_scope_id");