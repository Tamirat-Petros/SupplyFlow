import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.info('No seed data defined until the RBAC schema is introduced.');
}

main().finally(async () => prisma.$disconnect());

