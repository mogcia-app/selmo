import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { firebasePublicEnv } from "@/lib/firebase/env";

export const firebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebasePublicEnv);

export const firebaseAuth = getAuth(firebaseApp);

export const firestore = getFirestore(firebaseApp);

export const firebaseStorage = getStorage(firebaseApp);
