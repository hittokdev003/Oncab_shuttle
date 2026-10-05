-- Apply once before deploying wallet-enabled application code.
ALTER TABLE `users`
  ADD COLUMN `wallet_balance` decimal(12,2) NOT NULL DEFAULT 0.00;

CREATE TABLE `wallet_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `passenger_id` bigint unsigned NOT NULL,
  `type` enum('credit','debit') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) NOT NULL,
  `source` varchar(30) NOT NULL,
  `reference_type` varchar(30) NOT NULL,
  `reference_id` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallet_reference_type` (`reference_type`, `reference_id`, `type`),
  KEY `idx_wallet_passenger_created` (`passenger_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;