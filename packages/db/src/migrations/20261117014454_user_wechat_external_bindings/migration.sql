CREATE TABLE "user_wechat_external_binding" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_wechat_external_binding_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"corp_id" text NOT NULL,
	"open_id" text NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_wechat_external_binding_open_id_length" CHECK (octet_length("open_id") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_wechat_external_binding_active_identity_idx" ON "user_wechat_external_binding" ("corp_id","open_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_wechat_external_binding_user_id_idx" ON "user_wechat_external_binding" ("user_id");--> statement-breakpoint
ALTER TABLE "user_wechat_external_binding" ADD CONSTRAINT "user_wechat_external_binding_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;