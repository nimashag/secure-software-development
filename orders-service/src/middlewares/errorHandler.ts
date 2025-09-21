import { Request, Response, NextFunction } from "express";

// Centralized error handler
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log full error internally (safe for developers only)
  console.error("Unhandled error:", err);

  // Send generic error to client
  res.status(err.status || 500).json({
    message: "Something went wrong",   // ✅ never expose err.message directly
  });
}
