CREATE TABLE `place_event_places` (
	`event_id` text NOT NULL,
	`place_key` text NOT NULL,
	`place_name` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`event_id`, `place_key`)
);
--> statement-breakpoint
CREATE INDEX `place_event_places_place_event_idx` ON `place_event_places` (`place_key`,`event_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `place_event_places` (`event_id`, `place_key`, `place_name`, `position`)
SELECT `id`, `place_key`, `place_name`, 0 FROM `place_events`;
