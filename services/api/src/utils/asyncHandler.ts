import type { NextFunction, Request, Response } from "express";

export function asyncHandler<TReq extends Request = Request>(
  handler: (req: TReq, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: TReq, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

