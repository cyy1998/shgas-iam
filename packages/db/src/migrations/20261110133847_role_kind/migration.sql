CREATE TYPE "role_kind" AS ENUM('basic', 'composite');--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "role_kind" "role_kind" DEFAULT 'basic'::"role_kind" NOT NULL;