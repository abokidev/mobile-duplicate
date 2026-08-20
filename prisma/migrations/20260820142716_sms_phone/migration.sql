-- AlterTable
ALTER TABLE `candidates` ADD COLUMN `phone_number` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `events` MODIFY `type` ENUM('sent', 'send_failed', 'sms_sent', 'sms_failed', 'opened', 'page_visited', 'submitted') NOT NULL;
