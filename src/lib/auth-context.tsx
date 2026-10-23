"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import type { SessionResponse, User } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { firebaseConfigured } from "@/lib/config";
import { getFirebaseAuth } from "@/lib/firebase";

type AuthValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  accepted: SessionResponse["accepted"];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  dismissAccepted: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

async function syncSession(fbUser: FirebaseUser, name?: string) {
  return api.session({
    name: name || fbUser.displayName || "",
    photo: fbUser.photoURL || "",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = firebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<SessionResponse["accepted"]>([]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const session = await syncSession(fbUser);
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
        setError(null);
      } catch (err) {
        setUser(null);
        setError(err instanceof Error ? err.message : "Could not reach the server.");
        if (err instanceof ApiError && err.status === 401) await firebaseSignOut(auth);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      error,
      configured,
      accepted,
      clearError: () => setError(null),
      dismissAccepted: () => setAccepted([]),
      async signIn(email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        setError(null);
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const session = await syncSession(cred.user);
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signUp(name, email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        setError(null);
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        const session = await syncSession(cred.user, name.trim());
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signInWithGoogle() {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        setError(null);
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        const session = await syncSession(cred.user);
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signOut() {
        const auth = getFirebaseAuth();
        if (auth) await firebaseSignOut(auth);
        setUser(null);
        setAccepted([]);
      },
    }),
    [accepted, configured, error, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
