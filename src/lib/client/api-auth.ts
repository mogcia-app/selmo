"use client";

import { firebaseAuth } from "@/lib/firebase/client";

export async function getApiAuthHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
