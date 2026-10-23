import ImageKit from "imagekit";
import { HttpError } from "./http";

export function imageKitReady(): boolean {
  return Boolean(
    process.env.IMAGEKIT_PUBLIC_KEY &&
      process.env.IMAGEKIT_PRIVATE_KEY &&
      process.env.IMAGEKIT_URL_ENDPOINT,
  );
}

export function imageKitClient(): ImageKit {
  if (!imageKitReady()) {
    throw new HttpError(503, "ImageKit is not configured. Add the ImageKit keys to .env.local.");
  }
  return new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
  });
}

export function assertImageKitUrl(url: string): void {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) throw new HttpError(503, "ImageKit is not configured.");
  let expected: URL;
  let actual: URL;
  try {
    expected = new URL(endpoint);
    actual = new URL(url);
  } catch {
    throw new HttpError(400, "Attachment URL is invalid.");
  }
  if (actual.protocol !== "https:" || actual.host !== expected.host) {
    throw new HttpError(400, "Attachments must be uploaded to ImageKit.");
  }
}
