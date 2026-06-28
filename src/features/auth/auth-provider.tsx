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

export const authSessionDurationMs = 4 * 60 * 60 * 1000;

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
    companyName?: string;
  }) => Promise<AppUserProfile | null>;
  signOut: () => Promise<void>;
  sessionExpiresAt: number | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [shouldRefreshSession, setShouldRefreshSession] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    let unsubscribe: (() => void) | undefined;

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
          setSessionStartedAt(nextProfile ? Date.now() : null);
          setShouldRefreshSession(false);
          setIsLoading(false);
        });
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setSessionStartedAt(null);
        setShouldRefreshSession(false);
        setIsLoading(false);
      });

    return () => {
      isActive = false;
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
      sessionExpiresAt: sessionStartedAt ? sessionStartedAt + authSessionDurationMs : null,
      signIn: async (email, password) => {
        setIsLoading(true);
        try {
          const result = await signInWithEmail(email, password);
          setProfile(result.profile);
          setSessionStartedAt(Date.now());
          setShouldRefreshSession(false);
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
          setSessionStartedAt(Date.now());
          setShouldRefreshSession(false);
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
          setSessionStartedAt(null);
          setShouldRefreshSession(false);
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [isLoading, profile, sessionStartedAt],
  );

  useEffect(() => {
    if (!sessionStartedAt || !profile) {
      setShouldRefreshSession(false);
      return;
    }

    const expiresAt = sessionStartedAt + authSessionDurationMs;
    const checkSessionAge = () => {
      setShouldRefreshSession(Date.now() >= expiresAt);
    };

    checkSessionAge();
    const timeoutId = window.setTimeout(checkSessionAge, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", checkSessionAge);
    document.addEventListener("visibilitychange", checkSessionAge);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", checkSessionAge);
      document.removeEventListener("visibilitychange", checkSessionAge);
    };
  }, [profile, sessionStartedAt]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {shouldRefreshSession ? <SessionRefreshNotice /> : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

function SessionRefreshNotice() {
  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-[560px] rounded-[18px] border border-[#f0c655] bg-white px-4 py-4 shadow-[0_18px_44px_rgba(17,24,39,0.18)] sm:bottom-5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[14px] font-black text-[#171717]">画面の再読み込みをおすすめします</div>
          <p className="mt-1 text-[12px] leading-5 text-[#5f6673]">
            長時間開いたままのため、ログイン状態が古くなっている可能性があります。
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 shrink-0 rounded-[12px] bg-[#ffc400] px-4 text-[13px] font-black text-[#171717] transition hover:bg-[#f0b400]"
        >
          リロード
        </button>
      </div>
    </div>
  );
}
