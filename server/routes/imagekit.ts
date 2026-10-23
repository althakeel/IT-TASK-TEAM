import { Router } from "express";
import { requireUser } from "../access";
import { asyncHandler } from "../http";
import { imageKitClient } from "../imagekit";

export const imageKitRouter = Router();

imageKitRouter.get(
  "/imagekit/auth",
  asyncHandler(async (req, res) => {
    await requireUser(req);
    const imagekit = imageKitClient();
    const params = imagekit.getAuthenticationParameters();
    res.json({
      token: params.token,
      expire: params.expire,
      signature: params.signature,
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
  }),
);
