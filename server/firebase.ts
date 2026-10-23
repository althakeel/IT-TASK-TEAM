import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { HttpError } from "./http";

function projectId(): string {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
}

export function firebaseAdminReady(): boolean {
  return Boolean(projectId());
}

function auth() {
  const id = projectId();
  if (!id) {
    throw new HttpError(503, "Firebase is not configured. Add FIREBASE_PROJECT_ID to .env.local.");
  }
  if (!getApps().length) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId: id,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      initializeApp({ projectId: id });
    }
  }
  return getAuth();
}

export async function verifyFirebaseToken(token: string): Promise<DecodedIdToken> {
  try {
    return await auth().verifyIdToken(token);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Sign-in expired. Sign in again.");
  }
}
