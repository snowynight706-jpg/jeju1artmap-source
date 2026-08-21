CREATE TABLE `map_label_density_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`optional_label_scale_steps_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`revision` integer NOT NULL
);
