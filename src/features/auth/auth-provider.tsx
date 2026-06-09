"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  registerUser,
  signInWithEmail,
  signOutUser,
  subscribeToAuthState,
  type AppUserProfile,
} from "@/lib/firebase/auth";
import type { UserRole } from "@/types/domain";
import {
  getFirebaseConfigErrorMessage,
  isFirebaseConfigured,
  missingFirebaseEnvKeys,
} from "@/lib/firebase/env";

type AuthContextValue = {
  isLoading: boolean;
  isFirebaseReady: boolean;
  firebaseError: string | null;
  missingEnvKeys: string[];
  isAuthenticated: boolean;
  profile: AppUserProfile | null;
  signIn: (email: string, password: string) => Promise<AppUserProfile | null>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<AppUserProfile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = subscribeToAuthState(({ profile: nextProfile }) => {
      setProfile(nextProfile);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isFirebaseReady: isFirebaseConfigured,
      firebaseError: getFirebaseConfigErrorMessage(),
      missingEnvKeys: missingFirebaseEnvKeys,
      isAuthenticated: Boolean(profile),
      profile,
      signIn: async (email, password) => {
        setIsLoading(true);
        try {
          const result = await signInWithEmail(email, password);
          setProfile(result.profile);
          return result.profile;
        } finally {
          setIsLoading(false);
        }
      },
      signUp: async (input) => {
        setIsLoading(true);
        try {
          const result = await registerUser(input);
          setProfile(result.profile);
          return result.profile;
        } finally {
          setIsLoading(false);
        }
      },
      signOut: async () => {
        setIsLoading(true);
        try {
          await signOutUser();
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [isLoading, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
