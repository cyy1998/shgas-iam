ALTER TABLE "role" ADD COLUMN "role_type" varchar(16) DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_role_namespace_check" CHECK ("client_code" <> 'global' AND NOT starts_with("client_code", 'global:'));--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_type_ownership_check" CHECK ((
        ("role_type" = 'client' AND "client_id" IS NOT NULL AND NOT starts_with("role_code", 'global:'))
        OR
        ("role_type" = 'global' AND "client_id" IS NULL
          AND starts_with("role_code", 'global:')
          AND length(btrim(
            substring("role_code" from 8),
            U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
          )) > 0)
      ));