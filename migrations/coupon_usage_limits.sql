ALTER TABLE coupons
  ADD COLUMN per_device_limit INT DEFAULT NULL AFTER per_user_limit;

CREATE TABLE coupon_usages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id INT UNSIGNED NOT NULL,
  booking_id INT UNSIGNED NOT NULL,
  passenger_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(191) DEFAULT NULL,
  discount_amount DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY coupon_usages_booking_id_unique (booking_id),
  KEY coupon_usages_coupon_user_idx (coupon_id, passenger_id),
  KEY coupon_usages_coupon_device_idx (coupon_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;