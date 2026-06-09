type RequiredPublicEnvKey =
  | "NEXT_PUBLIC_FIREBASE_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "NEXT_PUBLIC_FIREBASE_APP_ID";

const firebaseEnvEntries: Array<[RequiredPublicEnvKey, string | undefined]> = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET],
  [
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID],
];

export const missingFirebaseEnvKeys = firebaseEnvEntries
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseEnvKeys.length === 0;

export const firebasePublicEnv = isFirebaseConfigured
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string,
    }
  : null;

export function getFirebaseConfigErrorMessage() {
  if (isFirebaseConfigured) {
    return null;
  }

  return `Missing Firebase environment variable: ${missingFirebaseEnvKeys[0]}`;
}
