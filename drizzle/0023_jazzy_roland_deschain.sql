CREATE TABLE `settings_resource_locks` (
	`resource` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings_resource_revisions` (
	`resource` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
