import { Router } from "express";

import { ApiError } from "../middleware/errorHandler.js";
import { getOfficialMatchResponse, getOfficialTruthStatus } from "../services/officialTruthService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const officialRouter = Router();

officialRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json({ data: getOfficialTruthStatus() });
  })
);

officialRouter.get(
  "/match/:id",
  asyncHandler(async (req, res) => {
    const response = getOfficialMatchResponse(req.params.id);

    if (!response) {
      throw new ApiError(
        404,
        `Official match record not found: ${req.params.id}`,
        "official_match_not_found"
      );
    }

    res.json({ data: response });
  })
);
