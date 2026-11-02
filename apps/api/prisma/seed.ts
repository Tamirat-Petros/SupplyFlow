import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const permissions = [
    'users.manage', 'roles.manage', 'audit.read', 'catalog.read', 'catalog.manage',
    'warehouses.read', 'warehouses.manage', 'suppliers.read', 'suppliers.manage',
    'customers.read', 'customers.manage', 'inventory.read', 'inventory.manage',
    'procurement.read', 'procurement.manage', 'sales.read', 'sales.manage',
    'payments.read', 'payments.manage', 'reports.read',
  ];
  await prisma.permission.createMany({ data: permissions.map((code) => ({ code })), skipDuplicates: true });
  const administrator = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'Full system administrator' },
  });
  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((permission) => ({ roleId: administrator.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
}

main().finally(async () => prisma.$disconnect());

