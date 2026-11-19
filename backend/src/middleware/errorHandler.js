/**
 * Error handling for Express
 */

import { ZodError } from "zod";
import multer from "multer";

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

/** Parse with a zod schema; throws a 400 with field errors on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Invalid request.", {
      errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    err = new HttpError(400, "Invalid request.", {
      errors: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) {
    err = new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message);
  }

  const status = err.statusCode || 500;
  if (status >= 500) console.error("[error]", req.method, req.originalUrl, err);

  res.status(status).json({
    success: false,
    error: status >= 500 && process.env.NODE_ENV === "production" ? "Internal server error." : err.message,
    ...(err.errors ? { errors: err.errors } : {}),
    ...(err.code && typeof err.code === "string" ? { code: err.code } : {}),
  });
};
