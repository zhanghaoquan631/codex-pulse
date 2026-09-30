CREATE TABLE `shop_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_limits_expiry` ON `shop_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shop_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`token_hash` text NOT NULL,
	`inventory_reserved` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_created_at` ON `shop_orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `shop_products` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`stock` integer,
	`price` real NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_status` ON `shop_products` (`status`);--> statement-breakpoint
CREATE TABLE `shop_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`credential_version` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `shop_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
