CREATE TABLE `public_map_layout` (
	`id` integer PRIMARY KEY NOT NULL,
	`document_json` text NOT NULL,
	`view_settings_json` text NOT NULL,
	`previous_document_json` text,
	`previous_view_settings_json` text,
	`published_at` text NOT NULL,
	`published_by` text NOT NULL,
	`revision` integer NOT NULL
);
