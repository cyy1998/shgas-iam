-- Keep the validation and replacement under a single lock that blocks Employment writes.
LOCK TABLE "employment" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
  duplicate_ids text;
BEGIN
  SELECT string_agg(array_to_string(ids, ', '), '; ' ORDER BY ids[1]) INTO duplicate_ids
  FROM (
    SELECT (array_agg(id ORDER BY id))[1:5] AS ids
    FROM "employment"
    WHERE "is_delete" = false AND "status" IN (1, 2, 4)
    GROUP BY "user_id", "dept_id", "pos_id"
    HAVING count(*) > 1
    ORDER BY min(id)
    LIMIT 20
  ) AS duplicate_relationships;
  IF duplicate_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('Employment migration found duplicate open relationships (sample ID groups: %s)', duplicate_ids),
      HINT = 'Run iam-ops employment verify to list all affected Employment IDs and resolve duplicate relationships before retrying.';
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "employment_active_relationship_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "employment_active_relationship_unique_idx" ON "employment" ("user_id","dept_id","pos_id") WHERE "is_delete" = false AND "status" IN (1, 2, 4);