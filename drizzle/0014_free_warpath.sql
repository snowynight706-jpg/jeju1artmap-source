CREATE TABLE `map_editor_draft` (
	`id` integer PRIMARY KEY NOT NULL,
	`document_json` text NOT NULL,
	`view_settings_json` text NOT NULL,
	`previous_document_json` text,
	`previous_view_settings_json` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`revision` integer NOT NULL
);
