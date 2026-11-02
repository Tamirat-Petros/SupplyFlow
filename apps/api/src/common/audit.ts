import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function recordAuditEvent(input: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string;
  reason?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}) {
  await prisma.auditEvent.create({ data: input });
}
