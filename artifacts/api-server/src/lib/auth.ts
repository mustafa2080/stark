import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { SafeUser } from "@workspace/db";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required but was not set.");
}
const JWT_SECRET: string = _jwtSecret;
const JWT_EXPIRES = "30d";

export function signToken(user: SafeUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.displayName, tenantId: user.tenantId ?? null, permissions: (user as any).permissions ?? [], shippingCompanyId: (user as any).shippingCompanyId ?? null, clientId: (user as any).clientId ?? null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

export function verifyToken(token: string): SafeUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as SafeUser;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
