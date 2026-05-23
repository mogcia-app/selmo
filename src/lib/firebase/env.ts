type RequiredPublicEnvKey =
  | "NEXT_PUBLIC_FIREBASE_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "NEXT_PUBLIC_FIREBASE_APP_ID";

function getRequiredEnv(key: RequiredPublicEnvKey) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${key}`);
  }

  return value;
}

export const firebasePublicEnv = {
  apiKey: getRequiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getRequiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getRequiredEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
} as const;
