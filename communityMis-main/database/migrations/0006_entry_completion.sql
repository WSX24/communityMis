-- Complete visible prototype entries: community posts, collections,
-- message attachments, archive markers, and maintenance support.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS `community_post` (
  `post_id` INT NOT NULL AUTO_INCREMENT,
  `author_id` INT NOT NULL,
  `category_id` INT NULL,
  `title` VARCHAR(100) NOT NULL,
  `content` TEXT NOT NULL,
  `tags_json` JSON NOT NULL,
  `visibility` ENUM('community','nearby','private') NOT NULL DEFAULT 'community',
  `status` ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published',
  `like_count` INT NOT NULL DEFAULT 0,
  `comment_count` INT NOT NULL DEFAULT 0,
  `collect_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`),
  KEY `idx_community_post_author_created` (`author_id`, `created_at`),
  KEY `idx_community_post_status_created` (`status`, `created_at`),
  KEY `idx_community_post_category_created` (`category_id`, `created_at`),
  CONSTRAINT `fk_community_post_author` FOREIGN KEY (`author_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_category` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_community_post_like_count` CHECK (`like_count` >= 0),
  CONSTRAINT `ck_community_post_comment_count` CHECK (`comment_count` >= 0),
  CONSTRAINT `ck_community_post_collect_count` CHECK (`collect_count` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `community_post_image` (
  `post_id` INT NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`, `file_id`),
  KEY `idx_community_post_image_file` (`file_id`),
  CONSTRAINT `fk_community_post_image_post` FOREIGN KEY (`post_id`) REFERENCES `community_post` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_image_file` FOREIGN KEY (`file_id`) REFERENCES `file_asset` (`file_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `community_post_comment` (
  `comment_id` INT NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `parent_id` INT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `like_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`),
  KEY `idx_community_post_comment_post_created` (`post_id`, `created_at`),
  KEY `idx_community_post_comment_user` (`user_id`),
  KEY `idx_community_post_comment_parent` (`parent_id`),
  CONSTRAINT `fk_community_post_comment_post` FOREIGN KEY (`post_id`) REFERENCES `community_post` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_comment_parent` FOREIGN KEY (`parent_id`) REFERENCES `community_post_comment` (`comment_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_community_post_comment_like_count` CHECK (`like_count` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `community_post_like` (
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`, `user_id`),
  KEY `idx_community_post_like_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_community_post_like_post` FOREIGN KEY (`post_id`) REFERENCES `community_post` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_like_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `community_post_comment_like` (
  `comment_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`, `user_id`),
  KEY `idx_community_post_comment_like_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_community_post_comment_like_comment` FOREIGN KEY (`comment_id`) REFERENCES `community_post_comment` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_community_post_comment_like_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_collection` (
  `user_id` INT NOT NULL,
  `target_type` VARCHAR(40) NOT NULL,
  `target_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `target_type`, `target_id`),
  KEY `idx_user_collection_type_target` (`target_type`, `target_id`),
  KEY `idx_user_collection_created` (`created_at`),
  CONSTRAINT `fk_user_collection_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `message_attachment` (
  `message_id` INT NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`, `file_id`),
  KEY `idx_message_attachment_file` (`file_id`),
  CONSTRAINT `fk_message_attachment_message` FOREIGN KEY (`message_id`) REFERENCES `message` (`message_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_message_attachment_file` FOREIGN KEY (`file_id`) REFERENCES `file_asset` (`file_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD COLUMN `archived_at` DATETIME NULL AFTER `created_at`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'archived_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `notification` ADD COLUMN `archived_at` DATETIME NULL AFTER `created_at`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'archived_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `message` ADD KEY `idx_message_archived_created` (`archived_at`, `created_at`)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'message' AND INDEX_NAME = 'idx_message_archived_created'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `notification` ADD KEY `idx_notification_archived_created` (`archived_at`, `created_at`)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'notification' AND INDEX_NAME = 'idx_notification_archived_created'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
