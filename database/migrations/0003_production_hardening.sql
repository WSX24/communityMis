-- Production hardening: cookie sessions, verification, files, comments, follows, and message metadata.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_session` (
  `session_id` CHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `role` VARCHAR(30) NOT NULL,
  `csrf_token` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  KEY `idx_auth_session_user_expires` (`user_id`, `expires_at`),
  KEY `idx_auth_session_revoked` (`revoked_at`),
  CONSTRAINT `fk_auth_session_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `verification_code` (
  `verification_id` BIGINT NOT NULL AUTO_INCREMENT,
  `verification_token` CHAR(64) NOT NULL,
  `channel` ENUM('sms','email') NOT NULL,
  `purpose` VARCHAR(40) NOT NULL DEFAULT 'register',
  `recipient` VARCHAR(120) NOT NULL,
  `code_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `send_status` VARCHAR(30) NOT NULL DEFAULT 'sent',
  `provider_message_id` VARCHAR(128) NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uk_verification_token` (`verification_token`),
  KEY `idx_verification_recipient` (`channel`, `purpose`, `recipient`, `created_at`),
  KEY `idx_verification_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `file_asset` (
  `file_id` CHAR(36) NOT NULL,
  `owner_id` INT NOT NULL,
  `purpose` VARCHAR(40) NOT NULL DEFAULT 'general',
  `business_type` VARCHAR(40) NULL,
  `business_id` INT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`file_id`),
  KEY `idx_file_asset_owner` (`owner_id`, `created_at`),
  KEY `idx_file_asset_business` (`business_type`, `business_id`),
  CONSTRAINT `fk_file_asset_owner` FOREIGN KEY (`owner_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_file_asset_size` CHECK (`size_bytes` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `request_comment` (
  `comment_id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `parent_id` INT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `like_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`),
  KEY `idx_request_comment_request_created` (`request_id`, `created_at`),
  KEY `idx_request_comment_user` (`user_id`),
  KEY `idx_request_comment_parent` (`parent_id`),
  CONSTRAINT `fk_request_comment_request` FOREIGN KEY (`request_id`) REFERENCES `service_request` (`request_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_request_comment_parent` FOREIGN KEY (`parent_id`) REFERENCES `request_comment` (`comment_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_request_comment_like_count` CHECK (`like_count` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `request_comment_like` (
  `comment_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`, `user_id`),
  KEY `idx_request_comment_like_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_request_comment_like_comment` FOREIGN KEY (`comment_id`) REFERENCES `request_comment` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_comment_like_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_follow` (
  `follower_id` INT NOT NULL,
  `followee_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`follower_id`, `followee_id`),
  KEY `idx_user_follow_followee` (`followee_id`, `created_at`),
  CONSTRAINT `fk_user_follow_follower` FOREIGN KEY (`follower_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_follow_followee` FOREIGN KEY (`followee_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD COLUMN `business_type` VARCHAR(40) NULL AFTER `order_id`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'business_type'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD COLUMN `business_id` INT NULL AFTER `business_type`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'business_id'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD COLUMN `read_at` DATETIME NULL AFTER `is_read`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'read_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD KEY `idx_message_business` (`business_type`, `business_id`)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND INDEX_NAME = 'idx_message_business'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
