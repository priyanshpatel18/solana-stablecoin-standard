import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../logger";

export interface RequestWithId extends Request {
  id?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function requestLogMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });
  next();
}
