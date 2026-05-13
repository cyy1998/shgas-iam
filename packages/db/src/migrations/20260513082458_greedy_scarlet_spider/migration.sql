ALTER TABLE "user" ALTER COLUMN "create_time" SET DATA TYPE timestamp USING "create_time"::timestamp;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "update_time" SET DATA TYPE timestamp USING "update_time"::timestamp;
