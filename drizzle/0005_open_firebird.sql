CREATE TABLE `placement_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `placement_settings` (
	`place_key` text PRIMARY KEY NOT NULL,
	`directory_id` text,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
