import type { ErrorRequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "api_error"
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  console.error(JSON.stringify({ level: "error", message: "Unhandled API error", error: String(error) }));
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  });
};

