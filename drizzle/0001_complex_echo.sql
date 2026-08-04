CREATE TABLE `locked_coordinate_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locked_coordinate_settings` (
	`element_key` text PRIMARY KEY NOT NULL,
	`directory_id` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`anchor_x` real NOT NULL,
	`anchor_y` real NOT NULL,
	`output_x` real NOT NULL,
	`output_y` real NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
