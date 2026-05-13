CREATE TABLE "client" (
	"id" serial PRIMARY KEY,
	"client_code" varchar(64) NOT NULL UNIQUE,
	"client_name" varchar(128) NOT NULL,
	"client_secret" varchar(255) NOT NULL,
	"url" varchar(128),
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL,
	"ext_attributes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegation_detail" (
	"delegation_id" integer,
	"privilege_id" integer,
	CONSTRAINT "delegation_detail_pkey" PRIMARY KEY("delegation_id","privilege_id")
);
--> statement-breakpoint
CREATE TABLE "employment_role" (
	"employment_id" integer,
	"role_id" integer,
	CONSTRAINT "employment_role_pkey" PRIMARY KEY("employment_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "employment" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"pos_id" integer NOT NULL,
	"dept_id" integer NOT NULL,
	"comp_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_log" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"username" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"client_code" varchar(64) NOT NULL,
	"login_type" varchar(64) NOT NULL,
	"login_time" timestamp(0) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_closure" (
	"id" serial PRIMARY KEY,
	"ancestor_id" integer NOT NULL,
	"descendant_id" integer NOT NULL,
	"depth" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_role" (
	"organization_id" integer,
	"role_id" integer,
	"is_all_sub" boolean DEFAULT true NOT NULL,
	CONSTRAINT "organization_role_pkey" PRIMARY KEY("organization_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" serial PRIMARY KEY,
	"org_code" text NOT NULL UNIQUE,
	"org_name" text NOT NULL,
	"parent_id" integer DEFAULT -1 NOT NULL,
	"business_parent_id" integer DEFAULT -1 NOT NULL,
	"path" text NOT NULL,
	"level" integer NOT NULL,
	"org_type" text NOT NULL,
	"order_num" integer DEFAULT 0 NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"is_entity" boolean DEFAULT false NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_role" (
	"position_id" integer,
	"role_id" integer,
	CONSTRAINT "position_role_pkey" PRIMARY KEY("position_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" serial PRIMARY KEY,
	"post_code" varchar(64) NOT NULL UNIQUE,
	"post_name" varchar(128) NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privilege_delegation" (
	"id" serial PRIMARY KEY,
	"delegator_user_id" integer NOT NULL,
	"delegatee_user_id" integer NOT NULL,
	"organization_scope_id" integer NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privilege" (
	"id" serial PRIMARY KEY,
	"privilege_code" text NOT NULL UNIQUE,
	"privilege_name" text NOT NULL,
	"field_values" jsonb,
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_privilege" (
	"role_id" integer,
	"privilege_id" integer,
	CONSTRAINT "role_privilege_pkey" PRIMARY KEY("role_id","privilege_id")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" serial PRIMARY KEY,
	"role_code" varchar(64) NOT NULL UNIQUE,
	"role_name" varchar(128) NOT NULL,
	"client_id" integer NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"description" varchar(500),
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" serial PRIMARY KEY,
	"username" varchar(64) NOT NULL UNIQUE,
	"wxId" varchar(255),
	"name" varchar(64) NOT NULL,
	"password" varchar(255),
	"mobile_phone" varchar(20),
	"user_type" varchar(20) DEFAULT '正式员工' NOT NULL,
	"order_num" integer DEFAULT 999999 NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"is_delete" boolean DEFAULT false NOT NULL,
	"create_time" timestamp(0) DEFAULT now() NOT NULL,
	"update_time" timestamp(0) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_privilege" ON "delegation_detail" ("privilege_id");--> statement-breakpoint
CREATE INDEX "idx_employment_role_role_id" ON "employment_role" ("role_id");--> statement-breakpoint
CREATE INDEX "idx_employment_user_id" ON "employment" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_dept_id" ON "employment" ("dept_id");--> statement-breakpoint
CREATE INDEX "idx_comp_id" ON "employment" ("comp_id");--> statement-breakpoint
CREATE INDEX "idx_pos_id" ON "employment" ("pos_id");--> statement-breakpoint
CREATE INDEX "idx_pos_dept_id" ON "employment" ("pos_id","dept_id");--> statement-breakpoint
CREATE INDEX "idx_user_id" ON "login_log" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_username" ON "login_log" ("username");--> statement-breakpoint
CREATE INDEX "idx_client_code" ON "login_log" ("client_code");--> statement-breakpoint
CREATE INDEX "idx_login_time" ON "login_log" ("login_time");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_closure_ancestor_id_descendant_id_key" ON "organization_closure" ("ancestor_id","descendant_id");--> statement-breakpoint
CREATE INDEX "organization_closure_ancestor_id_idx" ON "organization_closure" ("ancestor_id");--> statement-breakpoint
CREATE INDEX "organization_closure_descendant_id_idx" ON "organization_closure" ("descendant_id");--> statement-breakpoint
CREATE INDEX "idx_organization_role_role_id" ON "organization_role" ("role_id");--> statement-breakpoint
CREATE INDEX "idx_parentId" ON "organization" ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_position_role_role_id" ON "position_role" ("role_id");--> statement-breakpoint
CREATE INDEX "idx_delegationTo" ON "privilege_delegation" ("delegator_user_id","delegatee_user_id");--> statement-breakpoint
CREATE INDEX "idx_delegationFrom" ON "privilege_delegation" ("delegatee_user_id","delegator_user_id");--> statement-breakpoint
CREATE INDEX "idx_organizationScopeId" ON "privilege_delegation" ("organization_scope_id");--> statement-breakpoint
CREATE INDEX "idx_privilege_id" ON "role_privilege" ("privilege_id");--> statement-breakpoint
CREATE INDEX "idx_client_id" ON "role" ("client_id");