-- Stage 02: base MySQL schema for the community time-bank platform.
-- Target database: MySQL 8.0+ / 8.4. Uses CHECK constraints and InnoDB FKs.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS `user` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) NULL,
  `skill_tags` VARCHAR(200) NULL,
  `role` ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user',
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_username` (`username`),
  KEY `idx_user_status` (`status`),
  CONSTRAINT `ck_user_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `wallet` (
  `wallet_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `frozen_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `version` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `uk_wallet_user` (`user_id`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_wallet_balance_non_negative` CHECK (`balance` >= 0),
  CONSTRAINT `ck_wallet_frozen_balance_non_negative` CHECK (`frozen_balance` >= 0),
  CONSTRAINT `ck_wallet_version_non_negative` CHECK (`version` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `category` (
  `category_id` INT NOT NULL AUTO_INCREMENT,
  `parent_id` INT NULL,
  `name` VARCHAR(50) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uk_category_code` (`code`),
  UNIQUE KEY `uk_category_name` (`name`),
  KEY `idx_category_parent` (`parent_id`),
  KEY `idx_category_status_sort` (`status`, `sort_order`),
  CONSTRAINT `fk_category_parent` FOREIGN KEY (`parent_id`) REFERENCES `category` (`category_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_category_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `service_request` (
  `request_id` INT NOT NULL AUTO_INCREMENT,
  `publisher_id` INT NOT NULL,
  `category_id` INT NULL,
  `title` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `location` VARCHAR(120) NULL,
  `estimated_hours` DECIMAL(5,1) NOT NULL,
  `coin_amount` DECIMAL(10,2) NOT NULL,
  `status` ENUM('open','accepted','completed','cancelled') NOT NULL DEFAULT 'open',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `idx_service_request_publisher` (`publisher_id`),
  KEY `idx_service_request_category` (`category_id`),
  KEY `idx_service_request_status_category_created` (`status`, `category_id`, `created_at`),
  KEY `idx_service_request_created` (`created_at`),
  CONSTRAINT `fk_service_request_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_service_request_category` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_service_request_estimated_hours` CHECK (`estimated_hours` > 0),
  CONSTRAINT `ck_service_request_coin_amount` CHECK (`coin_amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `service_order` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `provider_id` INT NOT NULL,
  `status` ENUM('accepted','payer_confirmed','both_confirmed','completed','disputed') NOT NULL DEFAULT 'accepted',
  `payer_confirmed` TINYINT NOT NULL DEFAULT 0,
  `provider_confirmed` TINYINT NOT NULL DEFAULT 0,
  `coin_amount` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` DATETIME NULL,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uk_service_order_request` (`request_id`),
  KEY `idx_service_order_provider` (`provider_id`),
  KEY `idx_service_order_status` (`status`),
  KEY `idx_service_order_created` (`created_at`),
  CONSTRAINT `fk_service_order_request` FOREIGN KEY (`request_id`) REFERENCES `service_request` (`request_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_service_order_provider` FOREIGN KEY (`provider_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_service_order_payer_confirmed` CHECK (`payer_confirmed` IN (0, 1)),
  CONSTRAINT `ck_service_order_provider_confirmed` CHECK (`provider_confirmed` IN (0, 1)),
  CONSTRAINT `ck_service_order_coin_amount` CHECK (`coin_amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `transaction_log` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `order_id` INT NULL,
  `type` ENUM('expense','income','system_fee','freeze','release','refund') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `balance_after` DECIMAL(10,2) NULL,
  `remark` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_transaction_log_user_created` (`user_id`, `created_at`),
  KEY `idx_transaction_log_order` (`order_id`),
  KEY `idx_transaction_log_type_created` (`type`, `created_at`),
  CONSTRAINT `fk_transaction_log_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transaction_log_order` FOREIGN KEY (`order_id`) REFERENCES `service_order` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_transaction_log_amount` CHECK (`amount` > 0),
  CONSTRAINT `ck_transaction_log_balance_after` CHECK (`balance_after` IS NULL OR `balance_after` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review` (
  `review_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `reviewer_id` INT NOT NULL,
  `target_id` INT NOT NULL,
  `direction` ENUM('publisher_to_provider','provider_to_publisher') NOT NULL,
  `rating` TINYINT NOT NULL,
  `comment` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uk_review_participants` (`order_id`, `reviewer_id`, `target_id`),
  UNIQUE KEY `uk_review_order_direction` (`order_id`, `direction`),
  KEY `idx_review_target_created` (`target_id`, `created_at`),
  KEY `idx_review_reviewer` (`reviewer_id`),
  CONSTRAINT `fk_review_order` FOREIGN KEY (`order_id`) REFERENCES `service_order` (`order_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_review_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_review_target` FOREIGN KEY (`target_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_review_rating` CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `message` (
  `message_id` INT NOT NULL AUTO_INCREMENT,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `order_id` INT NULL,
  `content` TEXT NOT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_message_sender_created` (`sender_id`, `created_at`),
  KEY `idx_message_receiver_read_created` (`receiver_id`, `is_read`, `created_at`),
  KEY `idx_message_order` (`order_id`),
  CONSTRAINT `fk_message_sender` FOREIGN KEY (`sender_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_message_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_message_order` FOREIGN KEY (`order_id`) REFERENCES `service_order` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_message_read` CHECK (`is_read` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `type` ENUM('system','order','wallet','review','dispute','ai') NOT NULL DEFAULT 'system',
  `title` VARCHAR(100) NOT NULL,
  `content` VARCHAR(500) NOT NULL,
  `business_type` VARCHAR(50) NULL,
  `business_id` INT NULL,
  `read_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notification_user_read_created` (`user_id`, `read_at`, `created_at`),
  KEY `idx_notification_type_created` (`type`, `created_at`),
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dispute` (
  `dispute_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `initiator_id` INT NOT NULL,
  `respondent_id` INT NOT NULL,
  `type` ENUM('not_completed','quality_issue','communication','other') NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `status` ENUM('pending','jury_voting','admin_review','resolved','cancelled') NOT NULL DEFAULT 'pending',
  `final_result` ENUM('publisher_win','provider_win','mediate','cancelled') NULL,
  `refund_amount` DECIMAL(10,2) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` DATETIME NULL,
  PRIMARY KEY (`dispute_id`),
  UNIQUE KEY `uk_dispute_order` (`order_id`),
  KEY `idx_dispute_status_created` (`status`, `created_at`),
  KEY `idx_dispute_initiator` (`initiator_id`),
  KEY `idx_dispute_respondent` (`respondent_id`),
  CONSTRAINT `fk_dispute_order` FOREIGN KEY (`order_id`) REFERENCES `service_order` (`order_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_dispute_initiator` FOREIGN KEY (`initiator_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_dispute_respondent` FOREIGN KEY (`respondent_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_dispute_refund_amount` CHECK (`refund_amount` IS NULL OR `refund_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dispute_evidence` (
  `evidence_id` INT NOT NULL AUTO_INCREMENT,
  `dispute_id` INT NOT NULL,
  `uploader_id` INT NOT NULL,
  `evidence_type` ENUM('text','image','file','chat') NOT NULL DEFAULT 'text',
  `content` TEXT NULL,
  `file_url` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`evidence_id`),
  KEY `idx_dispute_evidence_dispute_created` (`dispute_id`, `created_at`),
  KEY `idx_dispute_evidence_uploader` (`uploader_id`),
  CONSTRAINT `fk_dispute_evidence_dispute` FOREIGN KEY (`dispute_id`) REFERENCES `dispute` (`dispute_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dispute_evidence_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `jury_vote` (
  `vote_id` INT NOT NULL AUTO_INCREMENT,
  `dispute_id` INT NOT NULL,
  `juror_id` INT NOT NULL,
  `vote` ENUM('publisher','provider','mediate') NOT NULL,
  `reason` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vote_id`),
  UNIQUE KEY `uk_jury_vote_dispute_juror` (`dispute_id`, `juror_id`),
  KEY `idx_jury_vote_juror` (`juror_id`),
  CONSTRAINT `fk_jury_vote_dispute` FOREIGN KEY (`dispute_id`) REFERENCES `dispute` (`dispute_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jury_vote_juror` FOREIGN KEY (`juror_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sensitive_word` (
  `word_id` INT NOT NULL AUTO_INCREMENT,
  `word` VARCHAR(100) NOT NULL,
  `level` ENUM('warn','review','block') NOT NULL DEFAULT 'review',
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`word_id`),
  UNIQUE KEY `uk_sensitive_word_word` (`word`),
  KEY `idx_sensitive_word_status_level` (`status`, `level`),
  CONSTRAINT `fk_sensitive_word_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_sensitive_word_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_log` (
  `audit_id` INT NOT NULL AUTO_INCREMENT,
  `actor_id` INT NULL,
  `actor_role` VARCHAR(30) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `target_type` VARCHAR(50) NOT NULL,
  `target_id` INT NULL,
  `ip_address` VARCHAR(45) NULL,
  `detail` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_log_actor_created` (`actor_id`, `created_at`),
  KEY `idx_audit_log_action_created` (`action`, `created_at`),
  KEY `idx_audit_log_target` (`target_type`, `target_id`),
  CONSTRAINT `fk_audit_log_actor` FOREIGN KEY (`actor_id`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_conversation` (
  `conversation_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `role_type` VARCHAR(30) NOT NULL DEFAULT 'guest',
  `scene` VARCHAR(50) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`),
  KEY `idx_ai_conversation_user_updated` (`user_id`, `updated_at`),
  KEY `idx_ai_conversation_scene_status` (`scene`, `status`),
  CONSTRAINT `fk_ai_conversation_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_ai_conversation_status` CHECK (`status` IN ('active', 'closed', 'error', 'review'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_message` (
  `message_id` INT NOT NULL AUTO_INCREMENT,
  `conversation_id` INT NOT NULL,
  `sender_type` VARCHAR(20) NOT NULL,
  `content` TEXT NOT NULL,
  `business_type` VARCHAR(50) NULL,
  `business_id` INT NULL,
  `sensitive_hit` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_ai_message_conversation_created` (`conversation_id`, `created_at`),
  KEY `idx_ai_message_business` (`business_type`, `business_id`),
  CONSTRAINT `fk_ai_message_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversation` (`conversation_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ck_ai_message_sender_type` CHECK (`sender_type` IN ('user', 'ai', 'system')),
  CONSTRAINT `ck_ai_message_sensitive_hit` CHECK (`sensitive_hit` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_call_log` (
  `call_id` INT NOT NULL AUTO_INCREMENT,
  `conversation_id` INT NULL,
  `user_id` INT NULL,
  `scene` VARCHAR(50) NOT NULL,
  `request_tokens` INT NOT NULL DEFAULT 0,
  `response_tokens` INT NOT NULL DEFAULT 0,
  `duration_ms` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(30) NOT NULL,
  `error_message` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`call_id`),
  KEY `idx_ai_call_conversation` (`conversation_id`),
  KEY `idx_ai_call_user_created` (`user_id`, `created_at`),
  KEY `idx_ai_call_scene_status` (`scene`, `status`),
  CONSTRAINT `fk_ai_call_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversation` (`conversation_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ai_call_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_ai_call_tokens` CHECK (`request_tokens` >= 0 AND `response_tokens` >= 0),
  CONSTRAINT `ck_ai_call_duration` CHECK (`duration_ms` >= 0),
  CONSTRAINT `ck_ai_call_status` CHECK (`status` IN ('success', 'failed', 'blocked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_feedback` (
  `feedback_id` INT NOT NULL AUTO_INCREMENT,
  `message_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `rating` VARCHAR(20) NOT NULL,
  `comment` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  UNIQUE KEY `uk_ai_feedback_message_user` (`message_id`, `user_id`),
  KEY `idx_ai_feedback_user_created` (`user_id`, `created_at`),
  KEY `idx_ai_feedback_rating_created` (`rating`, `created_at`),
  CONSTRAINT `fk_ai_feedback_message` FOREIGN KEY (`message_id`) REFERENCES `ai_message` (`message_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ai_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_ai_feedback_rating` CHECK (`rating` IN ('useful', 'useless', 'wrong', 'unsafe'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_config` (
  `config_key` VARCHAR(80) NOT NULL,
  `config_value` JSON NOT NULL,
  `scope` VARCHAR(30) NOT NULL DEFAULT 'global',
  `description` VARCHAR(255) NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`),
  KEY `idx_ai_config_scope` (`scope`),
  CONSTRAINT `fk_ai_config_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS `trg_service_order_prevent_self_insert`;
DROP TRIGGER IF EXISTS `trg_service_order_prevent_self_update`;

DELIMITER $$
CREATE TRIGGER `trg_service_order_prevent_self_insert`
BEFORE INSERT ON `service_order`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `service_request`
    WHERE `request_id` = NEW.`request_id`
      AND `publisher_id` = NEW.`provider_id`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'provider_id cannot equal request publisher_id';
  END IF;
END$$

CREATE TRIGGER `trg_service_order_prevent_self_update`
BEFORE UPDATE ON `service_order`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `service_request`
    WHERE `request_id` = NEW.`request_id`
      AND `publisher_id` = NEW.`provider_id`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'provider_id cannot equal request publisher_id';
  END IF;
END$$
DELIMITER ;
