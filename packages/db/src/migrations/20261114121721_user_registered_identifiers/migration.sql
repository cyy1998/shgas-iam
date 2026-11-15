-- Normalize and index the same set of live rows while holding the write lock.
LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
WITH normalized AS (
  SELECT "id",
    NULLIF(btrim("mobile_phone", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') AS mobile,
    NULLIF(btrim("wxId", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') AS wx_id
  FROM "user"
  WHERE "is_delete" = false
), changed AS (
  UPDATE "user" AS u
  SET "mobile_phone" = n.mobile, "wxId" = n.wx_id
  FROM normalized AS n
  WHERE u."id" = n."id"
    AND (u."mobile_phone" IS DISTINCT FROM n.mobile OR u."wxId" IS DISTINCT FROM n.wx_id)
  RETURNING u."id"
)
INSERT INTO "user_document_outbox" ("id", "source")
SELECT gen_random_uuid(), jsonb_build_object('change', jsonb_build_object('kind', 'user', 'userId', "id"))
FROM changed;--> statement-breakpoint
CREATE UNIQUE INDEX "user_mobile_phone_non_deleted_idx" ON "user" ("mobile_phone") WHERE "is_delete" = false AND "mobile_phone" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_wx_id_non_deleted_idx" ON "user" ("wxId") WHERE "is_delete" = false AND "wxId" IS NOT NULL;