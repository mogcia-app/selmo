"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";

export type CustomerStatus =
  | "not_contacted"
  | "called"
  | "meeting_scheduled"
  | "meeting_done"
  | "proposal"
  | "contracted"
  | "lost"
  | "dormant";

export type CustomerTemperature = "high" | "middle" | "low";
export type CustomerChurnRisk = "high" | "middle" | "low";
export type CustomerLogType = "teleapo" | "meeting" | "email" | "quote" | "contract" | "follow" | "memo";

export type CustomerRecord = {
  id: string;
  companyId: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  employeeCount: number | null;
  assignedUserId: string;
  assignedUserName: string;
  status: CustomerStatus;
  temperature: CustomerTemperature;
  expectedAmount: number | null;
  lostReason: string;
  nextActionTitle: string;
  nextActionDate: Date | null;
  lastContactDate: Date | null;
  memo: string;
  isContracted: boolean;
  contractStartDate: Date | null;
  contractPlan: string;
  monthlyAmount: number | null;
  renewalDate: Date | null;
  churnRisk: CustomerChurnRisk;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CustomerLogRecord = {
  id: string;
  companyId: string;
  customerId: string;
  userId: string;
  type: CustomerLogType;
  title: string;
  body: string;
  actionDate: Date | null;
  createdAt: Date | null;
  createdBy: string;
};

export type CustomerMeetingLink = {
  id: string;
  companyId: string;
  customerId: string;
  meetingId: string;
  createdAt: Date | null;
};

export type SaveCustomerInput = {
  companyId: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  employeeCount: number | null;
  assignedUserId: string;
  assignedUserName: string;
  status: CustomerStatus;
  temperature: CustomerTemperature;
  expectedAmount: number | null;
  lostReason: string;
  nextActionTitle: string;
  nextActionDate: Date | null;
  lastContactDate: Date | null;
  memo: string;
  isContracted: boolean;
  contractStartDate: Date | null;
  contractPlan: string;
  monthlyAmount: number | null;
  renewalDate: Date | null;
  churnRisk: CustomerChurnRisk;
};

export type SaveCustomerLogInput = {
  companyId: string;
  customerId: string;
  userId: string;
  type: CustomerLogType;
  title: string;
  body: string;
  actionDate: Date | null;
  createdBy: string;
};

export function subscribeToCustomers(
  input: { companyId?: string | null; userId?: string | null; isAdmin?: boolean },
  callback: (customers: CustomerRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }

  const constraints = input.isAdmin || !input.userId
    ? [where("companyId", "==", input.companyId)]
    : [where("companyId", "==", input.companyId), where("assignedUserId", "==", input.userId)];
  const customersQuery = query(collection(firestore, "customers"), ...constraints);

  return onSnapshot(
    customersQuery,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((docSnapshot) => mapCustomerRecord(docSnapshot.id, docSnapshot.data()))
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      );
    },
    onError,
  );
}

export function subscribeToCustomer(
  customerId: string,
  callback: (customer: CustomerRecord | null) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  return onSnapshot(
    doc(firestore, "customers", customerId),
    (snapshot) => {
      callback(snapshot.exists() ? mapCustomerRecord(snapshot.id, snapshot.data()) : null);
    },
    onError,
  );
}

export async function createCustomer(input: SaveCustomerInput) {
  const { firestore } = assertFirebaseClient();
  const customerRef = await addDoc(collection(firestore, "customers"), {
    ...serializeCustomerInput(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return customerRef.id;
}

export async function updateCustomer(customerId: string, input: SaveCustomerInput) {
  const { firestore } = assertFirebaseClient();
  await updateDoc(doc(firestore, "customers", customerId), {
    ...serializeCustomerInput(input),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCustomerNextAction(
  customerId: string,
  input: { nextActionTitle: string; nextActionDate: Date | null; status?: CustomerStatus; temperature?: CustomerTemperature; lastContactDate?: Date | null },
) {
  const { firestore } = assertFirebaseClient();
  await updateDoc(doc(firestore, "customers", customerId), {
    nextActionTitle: input.nextActionTitle,
    nextActionDate: toTimestampOrNull(input.nextActionDate),
    ...(input.status ? { status: input.status } : {}),
    ...(input.temperature ? { temperature: input.temperature } : {}),
    ...(input.lastContactDate !== undefined ? { lastContactDate: toTimestampOrNull(input.lastContactDate) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToCustomerLogs(
  input: { companyId?: string | null; customerId?: string | null; userId?: string | null; isAdmin?: boolean },
  callback: (logs: CustomerLogRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }

  const constraints = [
    where("companyId", "==", input.companyId),
    ...(input.customerId ? [where("customerId", "==", input.customerId)] : []),
    ...(!input.isAdmin && input.userId ? [where("userId", "==", input.userId)] : []),
  ];
  const logsQuery = query(collection(firestore, "customerLogs"), ...constraints);

  return onSnapshot(
    logsQuery,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((docSnapshot) => mapCustomerLogRecord(docSnapshot.id, docSnapshot.data()))
          .sort((left, right) => (right.actionDate?.getTime() ?? right.createdAt?.getTime() ?? 0) - (left.actionDate?.getTime() ?? left.createdAt?.getTime() ?? 0)),
      );
    },
    onError,
  );
}

export async function createCustomerLog(input: SaveCustomerLogInput) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "customerLogs"), {
    companyId: input.companyId,
    customerId: input.customerId,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    actionDate: toTimestampOrNull(input.actionDate),
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
  });
}

export function subscribeToCustomerMeetings(
  input: { companyId?: string | null; customerId?: string | null },
  callback: (links: CustomerMeetingLink[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId || !input.customerId) {
    callback([]);
    return () => undefined;
  }

  const linksQuery = query(
    collection(firestore, "customerMeetings"),
    where("companyId", "==", input.companyId),
    where("customerId", "==", input.customerId),
  );

  return onSnapshot(
    linksQuery,
    (snapshot) => {
      callback(snapshot.docs.map((docSnapshot) => mapCustomerMeetingLink(docSnapshot.id, docSnapshot.data())));
    },
    onError,
  );
}

export async function createCustomerMeetingLink(input: { companyId: string; customerId: string; meetingId: string }) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "customerMeetings"), {
    companyId: input.companyId,
    customerId: input.customerId,
    meetingId: input.meetingId,
    createdAt: serverTimestamp(),
  });
}

function serializeCustomerInput(input: SaveCustomerInput) {
  return {
    companyId: input.companyId,
    companyName: input.companyName,
    contactName: input.contactName,
    phone: input.phone,
    email: input.email,
    industry: input.industry,
    employeeCount: input.employeeCount,
    assignedUserId: input.assignedUserId,
    assignedUserName: input.assignedUserName,
    status: input.status,
    temperature: input.temperature,
    expectedAmount: input.expectedAmount,
    lostReason: input.lostReason,
    nextActionTitle: input.nextActionTitle,
    nextActionDate: toTimestampOrNull(input.nextActionDate),
    lastContactDate: toTimestampOrNull(input.lastContactDate),
    memo: input.memo,
    isContracted: input.isContracted,
    contractStartDate: toTimestampOrNull(input.contractStartDate),
    contractPlan: input.contractPlan,
    monthlyAmount: input.monthlyAmount,
    renewalDate: toTimestampOrNull(input.renewalDate),
    churnRisk: input.churnRisk,
  };
}

function mapCustomerRecord(id: string, data: Record<string, unknown>): CustomerRecord {
  return {
    id,
    companyId: readString(data.companyId),
    companyName: readString(data.companyName),
    contactName: readString(data.contactName),
    phone: readString(data.phone),
    email: readString(data.email),
    industry: readString(data.industry),
    employeeCount: readNullableNumber(data.employeeCount),
    assignedUserId: readString(data.assignedUserId),
    assignedUserName: readString(data.assignedUserName),
    status: readCustomerStatus(data.status),
    temperature: readTemperature(data.temperature),
    expectedAmount: readNullableNumber(data.expectedAmount),
    lostReason: readString(data.lostReason),
    nextActionTitle: readString(data.nextActionTitle),
    nextActionDate: toDateValue(data.nextActionDate),
    lastContactDate: toDateValue(data.lastContactDate),
    memo: readString(data.memo),
    isContracted: data.isContracted === true,
    contractStartDate: toDateValue(data.contractStartDate),
    contractPlan: readString(data.contractPlan),
    monthlyAmount: readNullableNumber(data.monthlyAmount),
    renewalDate: toDateValue(data.renewalDate),
    churnRisk: readChurnRisk(data.churnRisk),
    createdAt: toDateValue(data.createdAt),
    updatedAt: toDateValue(data.updatedAt),
  };
}

function mapCustomerLogRecord(id: string, data: Record<string, unknown>): CustomerLogRecord {
  return {
    id,
    companyId: readString(data.companyId),
    customerId: readString(data.customerId),
    userId: readString(data.userId),
    type: readLogType(data.type),
    title: readString(data.title),
    body: readString(data.body),
    actionDate: toDateValue(data.actionDate),
    createdAt: toDateValue(data.createdAt),
    createdBy: readString(data.createdBy),
  };
}

function mapCustomerMeetingLink(id: string, data: Record<string, unknown>): CustomerMeetingLink {
  return {
    id,
    companyId: readString(data.companyId),
    customerId: readString(data.customerId),
    meetingId: readString(data.meetingId),
    createdAt: toDateValue(data.createdAt),
  };
}

function toDateValue(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function toTimestampOrNull(value: Date | null) {
  return value ? Timestamp.fromDate(value) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCustomerStatus(value: unknown): CustomerStatus {
  const statuses: CustomerStatus[] = ["not_contacted", "called", "meeting_scheduled", "meeting_done", "proposal", "contracted", "lost", "dormant"];
  return statuses.includes(value as CustomerStatus) ? (value as CustomerStatus) : "not_contacted";
}

function readTemperature(value: unknown): CustomerTemperature {
  return value === "high" || value === "middle" || value === "low" ? value : "middle";
}

function readChurnRisk(value: unknown): CustomerChurnRisk {
  return value === "high" || value === "middle" || value === "low" ? value : "low";
}

function readLogType(value: unknown): CustomerLogType {
  const types: CustomerLogType[] = ["teleapo", "meeting", "email", "quote", "contract", "follow", "memo"];
  return types.includes(value as CustomerLogType) ? (value as CustomerLogType) : "memo";
}
