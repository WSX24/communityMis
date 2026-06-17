-- Frontend productionization support: file visibility and admin backup records.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    "ALTER TABLE `file_asset` ADD COLUMN `visibility` ENUM('public','private') NOT NULL DEFAULT 'private' AFTER `size_bytes`",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'file_asset' AND COLUMN_NAME = 'visibility'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `admin_backup` (
  `backup_id` CHAR(36) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'ready',
  `size_bytes` BIGINT NOT NULL DEFAULT 0,
  `checksum` CHAR(64) NOT NULL,
  `snapshot_json` JSON NULL,
  `created_by` INT NULL,
  `restored_by` INT NULL,
  `deleted_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `restored_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`backup_id`),
  KEY `idx_admin_backup_created` (`created_at`),
  KEY `idx_admin_backup_status` (`status`, `deleted_at`),
  CONSTRAINT `fk_admin_backup_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_admin_backup_restored_by` FOREIGN KEY (`restored_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_admin_backup_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_admin_backup_size` CHECK (`size_bytes` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
