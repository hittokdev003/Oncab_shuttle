ALTER TABLE `owner_approval_requests`
  MODIFY COLUMN `request_type` enum('driver_create','driver_update','vehicle_create','vehicle_update','trip_assignment') NOT NULL;