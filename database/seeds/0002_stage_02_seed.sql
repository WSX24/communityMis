-- Stage 02 seed data. Explicit IDs make local demos and tests stable.
-- The script is idempotent: every insert uses a primary/unique key upsert.

SET NAMES utf8mb4;

INSERT INTO `user` (`user_id`, `username`, `password_hash`, `phone`, `skill_tags`, `role`, `status`, `created_at`)
VALUES
  (1001, 'user_a', 'pbkdf2_sha256$120000$stage03-user-salt$eLn-2NQC73GLNJDbQqQRQiPkO6p1IrHNeysZP8_VWGY', '13900001001', '["代买","家政","陪诊"]', 'user', 1, '2026-06-01 09:00:00'),
  (1002, 'user_b', 'pbkdf2_sha256$120000$stage03-user-salt$eLn-2NQC73GLNJDbQqQRQiPkO6p1IrHNeysZP8_VWGY', '13900001002', '["维修","搬运","宠物照看"]', 'user', 1, '2026-06-01 09:10:00'),
  (1003, 'user_c', 'pbkdf2_sha256$120000$stage03-user-salt$eLn-2NQC73GLNJDbQqQRQiPkO6p1IrHNeysZP8_VWGY', '13900001003', '["数学辅导","电脑维修"]', 'user', 1, '2026-06-01 09:20:00'),
  (1004, 'disabled_user', 'pbkdf2_sha256$120000$stage03-user-salt$eLn-2NQC73GLNJDbQqQRQiPkO6p1IrHNeysZP8_VWGY', '13900001004', '["临时禁用"]', 'user', 0, '2026-06-01 09:30:00'),
  (9001, 'admin_main', 'pbkdf2_sha256$120000$stage03-admin-salt$jZySVEMbMbgGnWWJVkjFZFryrahLk5xU3S127JW5Hcs', '13900009001', '["平台治理"]', 'admin', 1, '2026-06-01 08:00:00')
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `phone` = VALUES(`phone`),
  `skill_tags` = VALUES(`skill_tags`),
  `role` = VALUES(`role`),
  `status` = VALUES(`status`);

INSERT INTO `wallet` (`wallet_id`, `user_id`, `balance`, `frozen_balance`, `version`)
VALUES
  (1101, 1001, 120.00, 20.00, 1),
  (1102, 1002, 68.50, 0.00, 1),
  (1103, 1003, 45.00, 0.00, 0),
  (1104, 1004, 0.00, 0.00, 0),
  (1901, 9001, 0.00, 0.00, 0)
ON DUPLICATE KEY UPDATE
  `balance` = VALUES(`balance`),
  `frozen_balance` = VALUES(`frozen_balance`),
  `version` = VALUES(`version`);

INSERT INTO `category` (`category_id`, `name`, `code`, `description`, `sort_order`, `status`)
VALUES
  (10, '跑腿代办', 'errand', '代取快递、代买日用品、短距离送达', 10, 1),
  (11, '家政维修', 'home_repair', '家政清洁、家具安装、轻维修', 20, 1),
  (12, '学习辅导', 'tutoring', '作业辅导、技能教学、设备使用指导', 30, 1),
  (13, '宠物照看', 'pet_care', '遛狗、喂猫、临时照看', 40, 1),
  (14, '社区公益', 'community', '公益活动、邻里通知、社区协作', 50, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `service_request` (`request_id`, `publisher_id`, `category_id`, `title`, `description`, `location`, `estimated_hours`, `coin_amount`, `status`, `created_at`)
VALUES
  (2001, 1001, 10, '帮忙代取快递到 5 号楼', '快递在南门驿站，18:00 前送到 5 号楼大厅即可。', '南门驿站', 0.5, 10.00, 'open', '2026-06-04 09:00:00'),
  (2002, 1001, 11, '帮忙组装书柜', '需要自带简单工具，预计 2 小时完成。', '3 号楼 1202', 2.0, 30.00, 'accepted', '2026-06-03 15:00:00'),
  (2003, 1001, 10, '帮李阿姨代购日用品', '按清单在小区超市代买并送到门口。', '小区超市', 1.0, 18.00, 'completed', '2026-06-02 10:00:00'),
  (2004, 1002, 13, '周末帮忙遛狗', '周六下午照看边牧 1 小时，需有宠物经验。', '北区花园', 1.0, 20.00, 'open', '2026-06-05 12:00:00'),
  (2005, 1001, 12, '辅导初三数学 2 小时', '主要讲解函数和几何题，需提前沟通讲义。', '线上', 2.0, 40.00, 'accepted', '2026-05-28 09:30:00')
ON DUPLICATE KEY UPDATE
  `publisher_id` = VALUES(`publisher_id`),
  `category_id` = VALUES(`category_id`),
  `title` = VALUES(`title`),
  `description` = VALUES(`description`),
  `location` = VALUES(`location`),
  `estimated_hours` = VALUES(`estimated_hours`),
  `coin_amount` = VALUES(`coin_amount`),
  `status` = VALUES(`status`);

INSERT INTO `service_order` (`order_id`, `request_id`, `provider_id`, `status`, `payer_confirmed`, `provider_confirmed`, `coin_amount`, `created_at`, `completed_at`)
VALUES
  (3001, 2002, 1002, 'accepted', 0, 0, 30.00, '2026-06-03 15:20:00', NULL),
  (3002, 2003, 1002, 'completed', 1, 1, 18.00, '2026-06-02 10:30:00', '2026-06-02 12:10:00'),
  (3003, 2005, 1003, 'disputed', 0, 1, 40.00, '2026-05-28 10:00:00', NULL)
ON DUPLICATE KEY UPDATE
  `provider_id` = VALUES(`provider_id`),
  `status` = VALUES(`status`),
  `payer_confirmed` = VALUES(`payer_confirmed`),
  `provider_confirmed` = VALUES(`provider_confirmed`),
  `coin_amount` = VALUES(`coin_amount`),
  `completed_at` = VALUES(`completed_at`);

INSERT INTO `transaction_log` (`log_id`, `user_id`, `order_id`, `type`, `amount`, `balance_after`, `remark`, `created_at`)
VALUES
  (4001, 1001, 3002, 'expense', 18.00, 102.00, '订单完成，需求方支出时间币', '2026-06-02 12:10:00'),
  (4002, 1002, 3002, 'income', 18.00, 68.50, '订单完成，服务方收入时间币', '2026-06-02 12:10:01'),
  (4003, 1001, 3003, 'freeze', 40.00, 120.00, '纠纷处理中，相关时间币保持冻结', '2026-05-28 10:05:00'),
  (4004, NULL, 3002, 'system_fee', 0.90, NULL, '演示平台抽成流水', '2026-06-02 12:10:02')
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `order_id` = VALUES(`order_id`),
  `type` = VALUES(`type`),
  `amount` = VALUES(`amount`),
  `balance_after` = VALUES(`balance_after`),
  `remark` = VALUES(`remark`);

INSERT INTO `review` (`review_id`, `order_id`, `reviewer_id`, `target_id`, `direction`, `rating`, `comment`, `created_at`)
VALUES
  (5001, 3002, 1001, 1002, 'publisher_to_provider', 5, '响应很快，物品齐全，沟通清楚。', '2026-06-02 13:00:00'),
  (5002, 3002, 1002, 1001, 'provider_to_publisher', 5, '需求描述准确，确认及时。', '2026-06-02 13:05:00')
ON DUPLICATE KEY UPDATE
  `reviewer_id` = VALUES(`reviewer_id`),
  `target_id` = VALUES(`target_id`),
  `direction` = VALUES(`direction`),
  `rating` = VALUES(`rating`),
  `comment` = VALUES(`comment`);

INSERT INTO `message` (`message_id`, `sender_id`, `receiver_id`, `order_id`, `content`, `is_read`, `created_at`)
VALUES
  (6001, 1001, 1002, 3001, '你好，书柜包装在客厅，工具需要自带。', 1, '2026-06-03 15:25:00'),
  (6002, 1002, 1001, 3001, '收到，我 17:30 到。', 0, '2026-06-03 15:27:00'),
  (6003, 1003, 1001, 3003, '我已提交服务记录，等待你确认。', 1, '2026-05-28 10:20:00')
ON DUPLICATE KEY UPDATE
  `content` = VALUES(`content`),
  `is_read` = VALUES(`is_read`);

INSERT INTO `notification` (`notification_id`, `user_id`, `type`, `title`, `content`, `business_type`, `business_id`, `read_at`, `created_at`)
VALUES
  (7001, 1001, 'order', '需求已被接单', 'user_b 已接单：帮忙组装书柜。', 'order', 3001, NULL, '2026-06-03 15:21:00'),
  (7002, 1002, 'wallet', '时间币已入账', '帮李阿姨代购日用品订单已完成，收入 18.00 时间币。', 'order', 3002, '2026-06-02 13:30:00', '2026-06-02 12:11:00'),
  (7003, 9001, 'dispute', '有纠纷等待终审', '辅导初三数学 2 小时进入管理员复核。', 'dispute', 8001, NULL, '2026-05-28 11:00:00')
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `read_at` = VALUES(`read_at`);

INSERT INTO `dispute` (`dispute_id`, `order_id`, `initiator_id`, `respondent_id`, `type`, `reason`, `status`, `final_result`, `refund_amount`, `created_at`)
VALUES
  (8001, 3003, 1001, 1003, 'quality_issue', '需求方认为辅导内容与约定不一致，请管理员核对聊天记录和课堂截图。', 'admin_review', NULL, 12.00, '2026-05-28 10:40:00')
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `reason` = VALUES(`reason`),
  `status` = VALUES(`status`),
  `final_result` = VALUES(`final_result`),
  `refund_amount` = VALUES(`refund_amount`);

INSERT INTO `dispute_evidence` (`evidence_id`, `dispute_id`, `uploader_id`, `evidence_type`, `content`, `file_url`, `created_at`)
VALUES
  (8101, 8001, 1001, 'text', '课堂中途调整了讲解内容，与原需求不一致。', NULL, '2026-05-28 10:45:00'),
  (8102, 8001, 1003, 'image', '已上传课堂板书截图，证明完成函数和几何讲解。', '/uploads/demo/math-board.png', '2026-05-28 10:52:00')
ON DUPLICATE KEY UPDATE
  `content` = VALUES(`content`),
  `file_url` = VALUES(`file_url`);

INSERT INTO `jury_vote` (`vote_id`, `dispute_id`, `juror_id`, `vote`, `reason`, `created_at`)
VALUES
  (8201, 8001, 1002, 'mediate', '双方证据都不完整，建议按比例退还。', '2026-05-28 11:30:00')
ON DUPLICATE KEY UPDATE
  `vote` = VALUES(`vote`),
  `reason` = VALUES(`reason`);

INSERT INTO `sensitive_word` (`word_id`, `word`, `level`, `status`, `created_by`, `created_at`)
VALUES
  (8301, '私下交易', 'review', 1, 9001, '2026-06-01 08:30:00'),
  (8302, '现金结算', 'warn', 1, 9001, '2026-06-01 08:35:00'),
  (8303, '辱骂', 'block', 1, 9001, '2026-06-01 08:40:00')
ON DUPLICATE KEY UPDATE
  `level` = VALUES(`level`),
  `status` = VALUES(`status`),
  `created_by` = VALUES(`created_by`);

INSERT INTO `audit_log` (`audit_id`, `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `ip_address`, `detail`, `created_at`)
VALUES
  (8401, 9001, 'admin', 'seed.init', 'database', NULL, '127.0.0.1', JSON_OBJECT('stage', '02', 'scope', 'schema-and-seed'), '2026-06-01 08:45:00'),
  (8402, 9001, 'admin', 'dispute.review', 'dispute', 8001, '127.0.0.1', JSON_OBJECT('status', 'admin_review', 'ai_summary', true), '2026-05-28 11:05:00')
ON DUPLICATE KEY UPDATE
  `action` = VALUES(`action`),
  `detail` = VALUES(`detail`);

INSERT INTO `ai_conversation` (`conversation_id`, `user_id`, `role_type`, `scene`, `status`, `created_at`, `updated_at`)
VALUES
  (8501, 1001, 'user', 'request_filter', 'closed', '2026-06-04 09:05:00', '2026-06-04 09:06:00'),
  (8502, 9001, 'admin', 'dispute_summary', 'review', '2026-05-28 11:02:00', '2026-05-28 11:04:00'),
  (8503, NULL, 'guest', 'help', 'closed', '2026-06-04 20:00:00', '2026-06-04 20:01:00')
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `role_type` = VALUES(`role_type`),
  `scene` = VALUES(`scene`),
  `status` = VALUES(`status`),
  `updated_at` = VALUES(`updated_at`);

INSERT INTO `ai_message` (`message_id`, `conversation_id`, `sender_type`, `content`, `business_type`, `business_id`, `sensitive_hit`, `created_at`)
VALUES
  (8601, 8501, 'user', '帮我找今天发布的跑腿需求。', 'request', NULL, 0, '2026-06-04 09:05:10'),
  (8602, 8501, 'ai', '已找到 1 条开放跑腿需求：帮忙代取快递到 5 号楼。', 'request', 2001, 0, '2026-06-04 09:05:20'),
  (8603, 8502, 'user', '请汇总这起数学辅导纠纷。', 'dispute', 8001, 0, '2026-05-28 11:02:10'),
  (8604, 8502, 'ai', '建议管理员核对讲义约定、课堂截图时间和双方确认记录。', 'dispute', 8001, 0, '2026-05-28 11:03:10')
ON DUPLICATE KEY UPDATE
  `content` = VALUES(`content`),
  `business_type` = VALUES(`business_type`),
  `business_id` = VALUES(`business_id`),
  `sensitive_hit` = VALUES(`sensitive_hit`);

INSERT INTO `ai_call_log` (`call_id`, `conversation_id`, `user_id`, `scene`, `request_tokens`, `response_tokens`, `duration_ms`, `status`, `error_message`, `created_at`)
VALUES
  (8701, 8501, 1001, 'request_filter', 128, 196, 420, 'success', NULL, '2026-06-04 09:05:20'),
  (8702, 8502, 9001, 'dispute_summary', 356, 420, 880, 'success', NULL, '2026-05-28 11:03:10'),
  (8703, 8503, NULL, 'help', 32, 0, 80, 'blocked', '游客请求包含越权业务查询，已阻止。', '2026-06-04 20:01:00')
ON DUPLICATE KEY UPDATE
  `request_tokens` = VALUES(`request_tokens`),
  `response_tokens` = VALUES(`response_tokens`),
  `duration_ms` = VALUES(`duration_ms`),
  `status` = VALUES(`status`),
  `error_message` = VALUES(`error_message`);

INSERT INTO `ai_feedback` (`feedback_id`, `message_id`, `user_id`, `rating`, `comment`, `created_at`)
VALUES
  (8801, 8602, 1001, 'useful', '筛选结果准确。', '2026-06-04 09:07:00'),
  (8802, 8604, 9001, 'useful', '摘要可用于终审前快速定位证据。', '2026-05-28 11:06:00')
ON DUPLICATE KEY UPDATE
  `rating` = VALUES(`rating`),
  `comment` = VALUES(`comment`);

INSERT INTO `ai_config` (`config_key`, `config_value`, `scope`, `description`, `updated_by`)
VALUES
  ('ai.enabled', CAST('true' AS JSON), 'global', '是否启用 AI 助手入口', 9001),
  ('ai.rate_limit_per_hour', CAST('60' AS JSON), 'global', '单用户每小时 AI 调用上限', 9001),
  ('ai.log_retention_days', CAST('180' AS JSON), 'global', 'AI 会话和调用日志保留天数', 9001),
  ('ai.model.default', JSON_QUOTE('local-rule-assistant'), 'global', '本地开发默认 AI 模型占位', 9001)
ON DUPLICATE KEY UPDATE
  `config_value` = VALUES(`config_value`),
  `scope` = VALUES(`scope`),
  `description` = VALUES(`description`),
  `updated_by` = VALUES(`updated_by`);
