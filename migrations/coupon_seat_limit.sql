ALTER TABLE coupons
  ADD COLUMN max_seats INT DEFAULT NULL AFTER per_device_limit;