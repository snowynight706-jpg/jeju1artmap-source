CREATE TABLE `public_map_layout_history` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`document_json` text NOT NULL,
	`view_settings_json` text NOT NULL,
	`source_revision` integer NOT NULL,
	`element_count` integer NOT NULL,
	`placed_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_map_layout_history_created_idx` ON `public_map_layout_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `public_map_layout_history_revision_idx` ON `public_map_layout_history` (`source_revision`,`created_at`);