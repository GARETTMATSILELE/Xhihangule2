import { Request, Response, NextFunction } from 'express';

type RateBucket = {
  windowStartMs: number;
  count: number;
};

const operationInflight = new Map<string, number>();
const operationRateBuckets = new Map<string, RateBucket>();

const getCompanyKey = (req: Request): string => {
  const companyId = req.user?.companyId ? String(req.user.companyId) : '';
  return companyId || 'unknown-company';
};

export const createPerCompanyConcurrencyGuard = (options: {
  operation: string;
  maxConcurrent?: number;
}) => {
  const maxConcurrent = Math.max(1, Number(options.maxConcurrent || 1));
  const operation = options.operation;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${operation}:${getCompanyKey(req)}`;
    const inflight = operationInflight.get(key) || 0;
    if (inflight >= maxConcurrent) {
      return res.status(429).json({
        success: false,
        code: 'OPERATION_BUSY',
        message: `Another ${operation} task is already running for this company. Please retry shortly.`
      });
    }

    operationInflight.set(key, inflight + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const current = operationInflight.get(key) || 0;
      if (current <= 1) {
        operationInflight.delete(key);
      } else {
        operationInflight.set(key, current - 1);
      }
    };

    res.on('finish', release);
    res.on('close', release);
    next();
  };
};

export const createPerCompanyRateLimiter = (options: {
  operation: string;
  maxRequests: number;
  windowMs: number;
}) => {
  const maxRequests = Math.max(1, Number(options.maxRequests || 1));
  const windowMs = Math.max(1000, Number(options.windowMs || 1000));
  const operation = options.operation;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${operation}:${getCompanyKey(req)}`;
    const existing = operationRateBuckets.get(key);
    const withinWindow = Boolean(existing && now - existing.windowStartMs < windowMs);

    const bucket: RateBucket = withinWindow
      ? { windowStartMs: existing!.windowStartMs, count: existing!.count + 1 }
      : { windowStartMs: now, count: 1 };

    operationRateBuckets.set(key, bucket);
    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStartMs + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: `Too many ${operation} requests for this company. Retry in ${retryAfterSeconds}s.`
      });
    }

    next();
  };
};
