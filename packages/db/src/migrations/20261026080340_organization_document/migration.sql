ALTER TABLE "organization_search_change" RENAME TO "organization_document_outbox";--> statement-breakpoint
ALTER TABLE "organization_search_dirty" RENAME TO "organization_document_rebuild_state";--> statement-breakpoint
ALTER TABLE "organization_search_document" RENAME TO "organization_document";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_organization_id_positive_check" TO "organization_document_outbox_organization_id_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_scope_check" TO "organization_document_outbox_scope_check";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_status_check" TO "organization_document_outbox_status_check";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_attempts_check" TO "organization_document_outbox_attempts_check";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_processing_check" TO "organization_document_outbox_processing_check";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_requests_array_check" TO "organization_document_outbox_requests_array_check";--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_organization_id_positive_check" TO "organization_document_rebuild_state_target_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_version_positive_check" TO "organization_document_rebuild_state_version_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_status_check" TO "organization_document_rebuild_state_status_check";--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_attempts_check" TO "organization_document_rebuild_state_attempts_check";--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_processing_check" TO "organization_document_rebuild_state_processing_check";--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_organization_id_positive_check" TO "organization_document_organization_id_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_schema_version_positive_check" TO "organization_document_schema_version_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_source_version_positive_check" TO "organization_document_source_version_positive_check";--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_object_check" TO "organization_document_object_check";--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_visibility_check" TO "organization_document_visibility_check";--> statement-breakpoint
ALTER INDEX "organization_search_change_status_created_at_idx" RENAME TO "organization_document_outbox_status_created_at_idx";--> statement-breakpoint
ALTER INDEX "organization_search_change_status_processing_started_at_idx" RENAME TO "organization_document_outbox_status_processing_started_at_idx";--> statement-breakpoint
ALTER INDEX "organization_search_dirty_status_dirty_at_idx" RENAME TO "organization_document_rebuild_state_status_dirty_at_idx";--> statement-breakpoint
ALTER INDEX "organization_search_dirty_status_processing_started_at_idx" RENAME TO "organization_document_rebuild_state_processing_idx";--> statement-breakpoint
ALTER INDEX "organization_search_document_visible_schema_idx" RENAME TO "organization_document_visible_schema_idx";--> statement-breakpoint
ALTER INDEX "organization_search_document_document_gin_idx" RENAME TO "organization_document_document_gin_idx";--> statement-breakpoint
ALTER TABLE "organization_document_outbox" RENAME CONSTRAINT "organization_search_change_pkey" TO "organization_document_outbox_pkey";
--> statement-breakpoint
ALTER TABLE "organization_document_rebuild_state" RENAME CONSTRAINT "organization_search_dirty_pkey" TO "organization_document_rebuild_state_pkey";
--> statement-breakpoint
ALTER TABLE "organization_document" RENAME CONSTRAINT "organization_search_document_pkey" TO "organization_document_pkey";
--> statement-breakpoint
UPDATE "organization_document_outbox" SET "rebuild_requests" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('targetId', (request->>'organizationId')::integer, 'version', request->>'version'))
  FROM jsonb_array_elements("rebuild_requests") AS request
), '[]'::jsonb);
