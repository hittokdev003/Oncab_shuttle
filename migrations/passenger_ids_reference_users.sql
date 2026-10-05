-- Apply once after deploying the application change that treats passenger_id
-- as users.id. Existing historical rows are preserved; application-level
-- validation verifies users.id and registered mobile for new bookings.

ALTER TABLE `bookings`
  DROP FOREIGN KEY `bookings_ibfk_2`,
  MODIFY COLUMN `passenger_id` bigint unsigned DEFAULT NULL;

ALTER TABLE `payments`
  DROP FOREIGN KEY `payments_ibfk_2`,
  MODIFY COLUMN `passenger_id` bigint unsigned DEFAULT NULL;

ALTER TABLE `refunds`
  DROP FOREIGN KEY `refunds_ibfk_3`,
  MODIFY COLUMN `passenger_id` bigint unsigned DEFAULT NULL;