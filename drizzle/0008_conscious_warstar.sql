CREATE TABLE `booking_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`notes` text NOT NULL,
	`starts` integer NOT NULL,
	`ends` integer NOT NULL,
	`notification` text DEFAULT 'pending' NOT NULL,
	`ip_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_range` ON `booking_requests` (`starts`,`ends`);--> statement-breakpoint
CREATE INDEX `idx_booking_ip_created` ON `booking_requests` (`ip_hash`,`created`);