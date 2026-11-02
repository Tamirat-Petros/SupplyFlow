import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'System Administrator';
  if (!email || !password || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters before creating an administrator.');
  }
  const role = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!role) throw new Error('Run prisma:seed first to create the ADMIN role.');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName: name, passwordHash, status: 'ACTIVE' },
    create: { email, displayName: name, passwordHash, roles: { create: { roleId: role.id } } },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  console.info(`Administrator ready for ${email}`);
}

main().finally(async () => prisma.$disconnect());
