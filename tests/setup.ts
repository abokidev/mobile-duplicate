// Runs before each test file. Point the app's Prisma client at the TEST database
// BEFORE any app module (which reads DATABASE_URL at import time) is imported.
import 'dotenv/config';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
