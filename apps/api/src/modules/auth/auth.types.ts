import type { Request } from 'express';

export type AuthContext = {
  userId: string;
  email: string;
  roleNames: string[];
  permissions: string[];
  warehouseIds: string[];
};

export type AuthenticatedRequest = Request & { auth?: AuthContext };

