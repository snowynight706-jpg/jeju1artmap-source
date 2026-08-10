CREATE TABLE `dense_label_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`positions_json` text NOT NULL,
	`excluded_element_ids_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
