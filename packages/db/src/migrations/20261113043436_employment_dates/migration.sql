-- Prevent new writes between legacy period validation and the type change.
LOCK TABLE "employment" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
  reversed_ids text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO reversed_ids
  FROM (
    SELECT id FROM "employment" WHERE "end_time" < "start_time" ORDER BY id LIMIT 20
  ) AS reversed_periods;
  IF reversed_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('Employment migration found reversed legacy periods (sample IDs: %s)', reversed_ids),
      HINT = 'Review and correct legacy rows with end_time < start_time before rerunning the migration.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "employment" ALTER COLUMN "start_time" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "employment" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
-- Both USING expressions read the original UTC wall-clock timestamps.
ALTER TABLE "employment"
  ALTER COLUMN "start_time" SET DATA TYPE date
    USING ("start_time" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date,
  ALTER COLUMN "end_time" SET DATA TYPE date USING (
    ("end_time" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date +
    CASE WHEN "end_time" = "start_time"
      OR ("end_time" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::time <> TIME '00:00:00'
      THEN 1 ELSE 0 END
  );--> statement-breakpoint
ALTER TABLE "employment" ADD CONSTRAINT "employment_period_check" CHECK ("start_time" < "end_time");
