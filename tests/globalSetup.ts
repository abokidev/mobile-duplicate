import { execSync } from 'node:child_process';
import 'dotenv/config';

// Ensure the TEST database has the current schema before any test runs.
export default function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. The concurrency test needs a real MySQL/InnoDB database (see .env.example).'
    );
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
