CREATE TABLE `place_events` (
	`id` text PRIMARY KEY NOT NULL,
	`place_key` text NOT NULL,
	`place_name` text NOT NULL,
	`event_name` text NOT NULL,
	`event_info` text NOT NULL,
	`photo_key` text NOT NULL,
	`photo_content_type` text NOT NULL,
	`photo_size` integer NOT NULL,
	`visible_from` text NOT NULL,
	`visible_until` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `place_events_place_status_visibility_idx` ON `place_events` (`place_key`,`status`,`visible_from`,`visible_until`);--> statement-breakpoint
CREATE INDEX `place_events_status_visibility_created_idx` ON `place_events` (`status`,`visible_from`,`visible_until`,`created_at`);