/**
 * Create or update an admin dashboard user.
 *
 *   npm run admin:create -- admin@dragnet-solutions.com 'a-strong-password'
 *
 * Stand-in for Dragnet's shared admin auth (FR9). Replace with the ATLAS
 * mechanism in production.
 */
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/admin/auth.js';

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  if (!emailArg || !password) {
    console.error("Usage: npm run admin:create -- <email> '<password>'");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`Admin ready: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
