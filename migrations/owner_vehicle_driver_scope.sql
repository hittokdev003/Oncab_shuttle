-- Apply once to enable owner-scoped vehicle and driver management.

ALTER TABLE `vehicles`
  ADD COLUMN `owner_id` int unsigned DEFAULT NULL AFTER `id`;

ALTER TABLE `drivers`
  ADD COLUMN `owner_id` int unsigned DEFAULT NULL AFTER `id`;

CREATE INDEX `idx_vehicles_owner_id` ON `vehicles` (`owner_id`);
CREATE INDEX `idx_drivers_owner_id` ON `drivers` (`owner_id`);