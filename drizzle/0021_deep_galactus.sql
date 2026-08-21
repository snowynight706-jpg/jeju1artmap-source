CREATE TABLE `map_performance_diagnostics` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`element_count` integer NOT NULL,
	`label_count` integer NOT NULL,
	`viewport_width` integer NOT NULL,
	`viewport_height` integer NOT NULL,
	`device_memory` real,
	`hardware_concurrency` integer NOT NULL,
	`connection_type` text NOT NULL,
	`standalone` integer NOT NULL,
	`online` integer NOT NULL,
	`actor_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `map_performance_diagnostics_created_idx` ON `map_performance_diagnostics` (`created_at`);--> statement-breakpoint
CREATE INDEX `map_performance_diagnostics_actor_created_idx` ON `map_performance_diagnostics` (`actor_hash`,`created_at`);