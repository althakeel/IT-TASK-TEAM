import { getAnalytics, isSupported } from "firebase/analytics";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebaseConfigured } from "@/lib/config";

let analyticsStarted = false;

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined" || !firebaseConfigured()) return null;
  const app = getApps()[0] || initializeApp(firebaseConfig());
  startAnalytics(app);
  return getAuth(app);
}

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

function startAnalytics(app: FirebaseApp) {
  if (analyticsStarted) return;
  analyticsStarted = true;
  void isSupported()
    .then((supported) => {
      if (supported) getAnalytics(app);
    })
    .catch(() => undefined);
}
