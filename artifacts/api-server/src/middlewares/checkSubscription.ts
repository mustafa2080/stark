import type { Request, Response, NextFunction } from "express";

/**
 * checkSubscription — disabled for single-tenant mode
 * STARK Logistics is a single-tenant app, no subscription checks needed
 */
export async function checkSubscription(
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  next();
}
