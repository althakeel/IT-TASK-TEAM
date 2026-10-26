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
import { authPersistenceReady, getFirebaseAuth } from "@/lib/firebase";

type AuthValue = {
  user: User | null;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  configured: boolean;
  accepted: SessionResponse["accepted"];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (patch: { name?: string; photo?: string }) => void;
  clearError: () => void;
  dismissAccepted: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

async function syncSession(fbUser: FirebaseUser, name?: string) {
  return api.session({
    name: name || "",
    photo: name ? fbUser.photoURL || "" : "",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = firebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<SessionResponse["accepted"]>([]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setSignedIn(false);
        setUser(null);
        setLoading(false);
        return;
      }
      setSignedIn(true);
      try {
        let session;
        try {
          session = await syncSession(fbUser);
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
            await fbUser.getIdToken(true);
            session = await syncSession(fbUser);
          } else {
            throw err;
          }
        }
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reach the server.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      signedIn,
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
        await authPersistenceReady();
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        setSignedIn(true);
        const session = await syncSession(cred.user);
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signUp(name, email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        setError(null);
        await authPersistenceReady();
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        setSignedIn(true);
        const session = await syncSession(cred.user, name.trim());
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signInWithGoogle() {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        setError(null);
        await authPersistenceReady();
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        setSignedIn(true);
        const session = await syncSession(cred.user);
        setUser(session.user);
        if (session.accepted.length) setAccepted(session.accepted);
      },
      async signOut() {
        const auth = getFirebaseAuth();
        if (auth) await firebaseSignOut(auth);
        setSignedIn(false);
        setUser(null);
        setAccepted([]);
      },
      setProfile(patch: { name?: string; photo?: string }) {
        setUser((current) => (current ? { ...current, ...patch } : current));
      },
    }),
    [accepted, configured, error, loading, signedIn, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
