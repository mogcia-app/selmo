"use client";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";

export type AppNotification = {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: Date | null;
};

export function subscribeToAppNotifications(
  input: { companyId: string; userId: string },
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const notificationsQuery = query(
    collection(firestore, "appNotifications"),
    where("companyId", "==", input.companyId),
    where("userId", "==", input.userId),
  );
  let isActive = true;

  getDocs(notificationsQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as Record<string, unknown>;

            return {
              id: docSnapshot.id,
              companyId: String(data.companyId ?? ""),
              userId: String(data.userId ?? ""),
              title: String(data.title ?? ""),
              body: String(data.body ?? ""),
              href: String(data.href ?? "/sales/dashboard"),
              read: Boolean(data.read),
              createdAt: readDate(data.createdAt),
            };
          })
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))
          .slice(0, 3),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export async function markAppNotificationRead(notificationId: string) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "appNotifications", notificationId), {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createAppNotification(input: {
  companyId: string;
  userId: string;
  title: string;
  body: string;
  href?: string;
  type?: string;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "appNotifications"), {
    companyId: input.companyId,
    userId: input.userId,
    title: input.title,
    body: input.body,
    href: input.href ?? "/sales/dashboard",
    type: input.type ?? "admin_guidance",
    createdBy: input.createdBy ?? null,
    metadata: input.metadata ?? {},
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function readDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  return null;
}
