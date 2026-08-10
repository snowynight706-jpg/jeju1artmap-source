CREATE TABLE `place_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`place_key` text NOT NULL,
	`place_name` text NOT NULL,
	`author_name` text NOT NULL,
	`review_text` text NOT NULL,
	`photo_key` text,
	`photo_content_type` text,
	`photo_size` integer,
	`status` text NOT NULL,
	`actor_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`moderated_by` text
);
