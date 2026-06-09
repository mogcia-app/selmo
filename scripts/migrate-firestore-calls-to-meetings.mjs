import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const shouldApply = process.argv.includes("--apply");
const shouldDeleteOld = process.argv.includes("--delete-old");

if (!projectId) {
  console.error(
    [
      "Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
      "Set the project id before running this migration.",
    ].join(" "),
  );
  process.exit(1);
}

if (shouldDeleteOld && !shouldApply) {
  console.error("--delete-old must be used together with --apply.");
  process.exit(1);
}

if (getApps().length === 0) {
  const credential =
    clientEmail && privateKey
      ? cert({
          projectId,
          clientEmail,
          privateKey,
        })
      : applicationDefault();

  initializeApp({
    credential,
    projectId,
  });
}

const db = getFirestore();

async function main() {
  console.log(
    shouldApply
      ? "Running Firestore migration in APPLY mode."
      : "Running Firestore migration in DRY-RUN mode. No data will be written.",
  );

  const meetingCount = await migrateMeetings();
  const historyCount = await migrateMeetingOutcomeHistory();
  const monthlyCount = await migrateMonthlyStats();
  const userMonthlyCount = await migrateUserMonthlyStats();

  console.log("");
  console.log("Migration summary");
  console.log(`- meetings copied: ${meetingCount}`);
  console.log(`- meetingOutcomeHistory copied: ${historyCount}`);
  console.log(`- monthlyStats updated: ${monthlyCount}`);
  console.log(`- userMonthlyStats updated: ${userMonthlyCount}`);
}

async function migrateMeetings() {
  const snapshot = await db.collection("calls").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    count += 1;
    const meetingRef = db.collection("meetings").doc(doc.id);
    const payload = withUpdatedTimestamp(doc.data());

    await maybeSet(meetingRef, payload, { merge: true }, `meeting ${doc.id}`);
    await copyKnownSubdocuments(doc.id, "transcript");
    await copyKnownSubdocuments(doc.id, "metrics");
    await copyKnownSubdocuments(doc.id, "manualChecks");
    await copyKnownSubdocuments(doc.id, "aiComments");

    if (shouldDeleteOld) {
      await maybeDeleteCollectionDoc("calls", doc.id);
    }
  }

  return count;
}

async function copyKnownSubdocuments(meetingId, subcollection) {
  const snapshot = await db
    .collection("calls")
    .doc(meetingId)
    .collection(subcollection)
    .get();

  for (const doc of snapshot.docs) {
    const targetRef = db
      .collection("meetings")
      .doc(meetingId)
      .collection(subcollection)
      .doc(doc.id);

    await maybeSet(
      targetRef,
      withUpdatedTimestamp(doc.data()),
      { merge: true },
      `meetings/${meetingId}/${subcollection}/${doc.id}`,
    );

    if (shouldDeleteOld) {
      await maybeDeleteSubcollectionDoc("calls", meetingId, subcollection, doc.id);
    }
  }
}

async function migrateMeetingOutcomeHistory() {
  const snapshot = await db.collection("callOutcomeHistory").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    count += 1;
    const data = doc.data();
    const targetRef = db.collection("meetingOutcomeHistory").doc(doc.id);
    const payload = withUpdatedTimestamp({
      ...data,
      meetingId: data.callId ?? data.meetingId ?? null,
      callId: FieldValue.delete(),
    });

    await maybeSet(targetRef, payload, { merge: true }, `meetingOutcomeHistory ${doc.id}`);

    if (shouldDeleteOld) {
      await maybeDeleteCollectionDoc("callOutcomeHistory", doc.id);
    }
  }

  return count;
}

async function migrateMonthlyStats() {
  const snapshot = await db.collection("monthlyStats").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    count += 1;
    const data = doc.data();
    const payload = withUpdatedTimestamp({
      ...data,
      totalMeetingCount: data.totalMeetingCount ?? data.totalCallCount ?? 0,
      totalWonMeetingCount: data.totalWonMeetingCount ?? data.totalWonCount ?? 0,
      totalLostMeetingCount: data.totalLostMeetingCount ?? data.totalLostCount ?? 0,
      totalCallCount: FieldValue.delete(),
      totalWonCount: FieldValue.delete(),
      totalLostCount: FieldValue.delete(),
    });

    await maybeSet(doc.ref, payload, { merge: true }, `monthlyStats ${doc.id}`);
  }

  return count;
}

async function migrateUserMonthlyStats() {
  const snapshot = await db.collection("userMonthlyStats").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    count += 1;
    const data = doc.data();
    const payload = withUpdatedTimestamp({
      ...data,
      meetingCount: data.meetingCount ?? data.callCount ?? 0,
      wonMeetingCount: data.wonMeetingCount ?? data.wonCount ?? 0,
      lostMeetingCount: data.lostMeetingCount ?? data.lostCount ?? 0,
      consideringMeetingCount:
        data.consideringMeetingCount ?? data.consideringCount ?? 0,
      callCount: FieldValue.delete(),
      wonCount: FieldValue.delete(),
      lostCount: FieldValue.delete(),
      consideringCount: FieldValue.delete(),
    });

    await maybeSet(doc.ref, payload, { merge: true }, `userMonthlyStats ${doc.id}`);
  }

  return count;
}

function withUpdatedTimestamp(data) {
  return {
    ...data,
    updatedAt: data.updatedAt ?? FieldValue.serverTimestamp(),
  };
}

async function maybeSet(ref, payload, options, label) {
  if (!shouldApply) {
    console.log(`[dry-run] set ${label}`);
    return;
  }

  await ref.set(payload, options);
  console.log(`[apply] set ${label}`);
}

async function maybeDeleteCollectionDoc(collectionName, docId) {
  if (!shouldApply || !shouldDeleteOld) {
    console.log(`[dry-run] delete ${collectionName}/${docId}`);
    return;
  }

  await db.collection(collectionName).doc(docId).delete();
  console.log(`[apply] delete ${collectionName}/${docId}`);
}

async function maybeDeleteSubcollectionDoc(
  collectionName,
  docId,
  subcollection,
  subDocId,
) {
  if (!shouldApply || !shouldDeleteOld) {
    console.log(`[dry-run] delete ${collectionName}/${docId}/${subcollection}/${subDocId}`);
    return;
  }

  await db
    .collection(collectionName)
    .doc(docId)
    .collection(subcollection)
    .doc(subDocId)
    .delete();
  console.log(`[apply] delete ${collectionName}/${docId}/${subcollection}/${subDocId}`);
}

main().catch((error) => {
  console.error("Migration failed.");
  console.error(error);
  process.exit(1);
});
