CREATE TABLE `live_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `live_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`file_id` text NOT NULL,
	`metadata` text NOT NULL,
	`size` integer NOT NULL,
	`parts` text NOT NULL,
	`status` text NOT NULL,
	`upload_id` text,
	`type` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
