"use client";

import {
  Timestamp,
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { SalesDomain } from "@/lib/sales-domains";
import type { MeetingPurpose } from "@/types/domain";

export type CalendarEventCustomerType = "new" | "existing";

export type CalendarEvent = {
  id: string;
  companyId: string | null;
  userId: string;
  salesDomain: SalesDomain;
  customerName: string;
  productId: string | null;
  productName: string;
  customerType: CalendarEventCustomerType;
  targetSegment: string;
  meetingPurpose: MeetingPurpose;
  scheduledAt: Date | null;
  location: string;
  agenda: string;
  customerIssues: string;
  preparationMemo: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CreateCalendarEventInput = {
  companyId?: string | null;
  userId: string;
  salesDomain: SalesDomain;
  customerName: string;
  productId?: string | null;
  productName: string;
  customerType: CalendarEventCustomerType;
  targetSegment?: string;
  meetingPurpose: MeetingPurpose;
  scheduledAt: Date;
  location?: string;
  agenda?: string;
  customerIssues?: string;
  preparationMemo?: string;
};

export function subscribeToCalendarEvents(
  input: { companyId?: string | null; userId?: string | null; isAdmin?: boolean },
  callback: (events: CalendarEvent[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId || (!input.isAdmin && !input.userId)) {
    callback([]);
    return () => undefined;
  }

  const eventsQuery = input.isAdmin
    ? query(collection(firestore, "calendarEvents"), where("companyId", "==", input.companyId))
    : query(
        collection(firestore, "calendarEvents"),
        where("companyId", "==", input.companyId),
        where("userId", "==", input.userId),
      );

  return onSnapshot(
    eventsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapCalendarEvent)
          .sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "calendarEvents"), {
    companyId: input.companyId ?? null,
    userId: input.userId,
    salesDomain: input.salesDomain,
    customerName: input.customerName.trim(),
    productId: input.productId ?? null,
    productName: input.productName.trim(),
    customerType: input.customerType,
    targetSegment: input.targetSegment?.trim() ?? "",
    meetingPurpose: input.meetingPurpose,
    scheduledAt: Timestamp.fromDate(input.scheduledAt),
    location: input.location?.trim() ?? "",
    agenda: input.agenda?.trim() ?? "",
    customerIssues: input.customerIssues?.trim() ?? "",
    preparationMemo: input.preparationMemo?.trim() ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function mapCalendarEvent(snapshot: QueryDocumentSnapshot<DocumentData>): CalendarEvent {
  const data = snapshot.data();
  const salesDomain = data.salesDomain === "teleapo" ? "teleapo" : "meeting";
  const customerType = data.customerType === "existing" ? "existing" : "new";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readString(data.userId),
    salesDomain,
    customerName: readString(data.customerName),
    productId: readNullableString(data.productId),
    productName: readString(data.productName),
    customerType,
    targetSegment: readString(data.targetSegment),
    meetingPurpose: readMeetingPurpose(data.meetingPurpose),
    scheduledAt: readDate(data.scheduledAt),
    location: readString(data.location),
    agenda: readString(data.agenda),
    customerIssues: readString(data.customerIssues),
    preparationMemo: readString(data.preparationMemo),
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function readMeetingPurpose(value: unknown): MeetingPurpose {
  if (
    value === "new_proposal" ||
    value === "closing" ||
    value === "existing_followup" ||
    value === "relationship_building" ||
    value === "check_in" ||
    value === "upsell_cross_sell" ||
    value === "onboarding" ||
    value === "retention"
  ) {
    return value;
  }
  return "new_proposal";
}
