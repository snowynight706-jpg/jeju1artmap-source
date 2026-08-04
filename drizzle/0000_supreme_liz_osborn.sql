CREATE TABLE `primary_calibration_settings` (
	`name` text PRIMARY KEY NOT NULL,
	`source_x` real NOT NULL,
	`source_y` real NOT NULL,
	`target_x` real NOT NULL,
	`target_y` real NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
