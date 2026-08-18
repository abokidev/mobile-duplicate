-- AlterTable
ALTER TABLE `tokens` ADD COLUMN `delivery_enc` TEXT NULL,
    ADD COLUMN `last_reminder_sent_at` DATETIME(3) NULL,
    ADD COLUMN `reminder_count` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token_id` INTEGER NOT NULL,
    `type` ENUM('sent', 'send_failed', 'opened', 'page_visited', 'submitted') NOT NULL,
    `detail` TEXT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `events_token_id_idx`(`token_id`),
    INDEX `events_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_token_id_fkey` FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
