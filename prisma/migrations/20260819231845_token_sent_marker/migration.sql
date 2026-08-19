-- AlterTable
ALTER TABLE `tokens` ADD COLUMN `sent_at` DATETIME(3) NULL,
    ADD COLUMN `sent_template` VARCHAR(191) NULL;
