-- Production readiness: persistent profile/settings/system config, rate limits,
-- and provider delivery metadata for verification codes.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS `user_profile` (
  `user_id` INT NOT NULL,
  `display_name` VARCHAR(50) NULL,
  `bio` VARCHAR(300) NULL,
  `email` VARCHAR(120) NULL,
  `service_categories` JSON NOT NULL,
  `is_jury` TINYINT NOT NULL DEFAULT 0,
  `avatar_file_id` CHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_profile_email` (`email`),
  KEY `idx_user_profile_avatar` (`avatar_file_id`),
  CONSTRAINT `fk_user_profile_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_profile_avatar` FOREIGN KEY (`avatar_file_id`) REFERENCES `file_asset` (`file_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_user_profile_is_jury` CHECK (`is_jury` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_settings` (
  `user_id` INT NOT NULL,
  `settings_json` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `system_config` (
  `config_key` VARCHAR(80) NOT NULL,
  `config_value` JSON NOT NULL,
  `description` VARCHAR(255) NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`),
  CONSTRAINT `fk_system_config_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `rate_limit_bucket` (
  `scope` VARCHAR(80) NOT NULL,
  `identity_hash` CHAR(64) NOT NULL,
  `identity_hint` VARCHAR(255) NULL,
  `window_start` DATETIME NOT NULL,
  `window_seconds` INT NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scope`, `identity_hash`),
  KEY `idx_rate_limit_window` (`window_start`),
  CONSTRAINT `ck_rate_limit_window_seconds` CHECK (`window_seconds` > 0),
  CONSTRAINT `ck_rate_limit_count` CHECK (`count` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `verification_code` ADD COLUMN `sent_at` DATETIME NULL AFTER `provider_message_id`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'verification_code' AND COLUMN_NAME = 'sent_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `verification_code` ADD COLUMN `provider_error` VARCHAR(500) NULL AFTER `sent_at`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'verification_code' AND COLUMN_NAME = 'provider_error'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
