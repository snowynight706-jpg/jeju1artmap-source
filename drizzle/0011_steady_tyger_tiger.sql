CREATE TABLE `place_registration_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_name` text NOT NULL,
	`submitted_address` text NOT NULL,
	`submitted_description` text NOT NULL,
	`submitted_category` text NOT NULL,
	`submitted_marker_style` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`marker_style` text NOT NULL,
	`status` text NOT NULL,
	`actor_hash` text NOT NULL,
	`directory_id` text,
	`rejection_note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text
);
--> statement-breakpoint
CREATE INDEX `place_registration_requests_status_created_idx` ON `place_registration_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `place_registration_requests_actor_created_idx` ON `place_registration_requests` (`actor_hash`,`created_at`);