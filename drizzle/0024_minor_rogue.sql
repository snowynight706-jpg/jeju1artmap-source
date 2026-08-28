ALTER TABLE `place_events` ADD `is_pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `place_events_pinned_created_idx` ON `place_events` (`is_pinned`,`created_at`);