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
  enableAuthPersistence,
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
const AUTH_PROFILE_CACHE_KEY = "selmo.auth.profile";
const AUTH_READY_EXTRA_DELAY_MS = 3000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    const cachedProfile = readCachedProfile();

    if (cachedProfile) {
      setProfile(cachedProfile);
    }

    let isActive = true;
    let unsubscribe: (() => void) | undefined;
    let authReadyTimer: ReturnType<typeof setTimeout> | undefined;
    const finishLoadingAfterDelay = () => {
      if (authReadyTimer) {
        clearTimeout(authReadyTimer);
      }

      authReadyTimer = setTimeout(() => {
        if (isActive) {
          setIsLoading(false);
        }
      }, AUTH_READY_EXTRA_DELAY_MS);
    };

    enableAuthPersistence()
      .then(() => {
        if (!isActive) {
          return;
        }

        unsubscribe = subscribeToAuthState(({ profile: nextProfile }) => {
          if (!isActive) {
            return;
          }

          setProfile(nextProfile);
          writeCachedProfile(nextProfile);
          finishLoadingAfterDelay();
        });
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setProfile(null);
        writeCachedProfile(null);
        finishLoadingAfterDelay();
      });

    return () => {
      isActive = false;
      if (authReadyTimer) {
        clearTimeout(authReadyTimer);
      }
      unsubscribe?.();
    };
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
          writeCachedProfile(result.profile);
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
          writeCachedProfile(result.profile);
          return result.profile;
        } finally {
          setIsLoading(false);
        }
      },
      signOut: async () => {
        setIsLoading(true);
        try {
          await signOutUser();
          setProfile(null);
          writeCachedProfile(null);
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

function readCachedProfile() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(AUTH_PROFILE_CACHE_KEY);

    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<AppUserProfile>;

    if (
      typeof parsed.uid !== "string" ||
      (parsed.role !== "admin" && parsed.role !== "sales") ||
      (parsed.status !== "active" && parsed.status !== "inactive")
    ) {
      return null;
    }

    return {
      uid: parsed.uid,
      email: typeof parsed.email === "string" ? parsed.email : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
      role: parsed.role,
      status: parsed.status,
    };
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: AppUserProfile | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!profile) {
    window.localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify(profile));
}
