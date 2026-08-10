CREATE TABLE `admin_login_attempts` (
	`actor_hash` text PRIMARY KEY NOT NULL,
	`failure_count` integer NOT NULL,
	`window_started_at` text NOT NULL,
	`updated_at` text NOT NULL
);
