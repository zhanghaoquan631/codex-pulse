CREATE TABLE `local_apps_relay` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`relay_url` text NOT NULL,
	`last_seen` integer NOT NULL
);
