CREATE TABLE `place_story_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text NOT NULL,
	`actor_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_story_reports_story_actor_idx` ON `place_story_reports` (`story_id`,`actor_hash`);--> statement-breakpoint
CREATE INDEX `place_story_reports_story_status_idx` ON `place_story_reports` (`story_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `place_story_reports_actor_created_idx` ON `place_story_reports` (`actor_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `place_events` ADD `starts_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_events` ADD `ends_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `place_events` SET `starts_at` = `visible_from`, `ends_at` = `visible_until` WHERE `starts_at` = '' OR `ends_at` = '';
