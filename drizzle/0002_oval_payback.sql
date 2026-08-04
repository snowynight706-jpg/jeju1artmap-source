CREATE TABLE `place_directory` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`area` text NOT NULL,
	`address` text NOT NULL,
	`subtype` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`operating_info` text NOT NULL,
	`notes` text NOT NULL,
	`source_url` text NOT NULL,
	`map_url` text NOT NULL,
	`checked_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `place_directory_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
