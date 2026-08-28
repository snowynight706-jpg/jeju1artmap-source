CREATE TABLE `site_identity_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`revision` integer NOT NULL
);
