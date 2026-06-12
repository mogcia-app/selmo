"use client";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";

export type CompanyNotificationSettings = {
  notificationEmails: string[];
};

export async function fetchCompanyNotificationSettings(companyId: string): Promise<CompanyNotificationSettings> {
  const { firestore } = assertFirebaseClient();
  const snapshot = await getDoc(doc(firestore, "companies", companyId));

  if (!snapshot.exists()) {
    return { notificationEmails: [] };
  }

  const data = snapshot.data() as { notificationEmails?: unknown };

  return {
    notificationEmails: readEmailArray(data.notificationEmails).slice(0, 3),
  };
}

export async function updateCompanyNotificationEmails(input: {
  companyId: string;
  notificationEmails: string[];
}) {
  const { firestore } = assertFirebaseClient();
  const notificationEmails = normalizeEmails(input.notificationEmails).slice(0, 3);

  await updateDoc(doc(firestore, "companies", input.companyId), {
    notificationEmails,
    updatedAt: serverTimestamp(),
  });

  return { notificationEmails };
}

function readEmailArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function normalizeEmails(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && isEmail(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
