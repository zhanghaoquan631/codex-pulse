CREATE TABLE `compass_alerts` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	`seen` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`scope`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_compass_alerts_unseen` ON `compass_alerts` (`scope`,`seen`,`created`);