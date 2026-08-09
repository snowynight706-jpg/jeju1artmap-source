CREATE TABLE IF NOT EXISTS `place_directory_source_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`source_version` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `place_print_settings` (
	`place_key` text PRIMARY KEY NOT NULL,
	`directory_id` text,
	`name` text NOT NULL,
	`recommended` integer NOT NULL,
	`marker_mode` text NOT NULL,
	`label_mode` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
