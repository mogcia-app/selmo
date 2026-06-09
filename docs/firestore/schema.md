# Firestore Collection Design

MVPでは「打ち合わせごとの原本」と「表示用の集計済みデータ」を分けて持ちます。
Firestoreは重い集計が得意ではないため、管理画面は `monthlyStats` や `userMonthlyStats` を参照する前提です。

## Collections

### `users/{userId}`

```ts
type UserDocument = {
  name: string;
  email: string;
  role: "admin" | "sales";
  status: "active" | "inactive";
  teamId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `meetings/{meetingId}`

```ts
type MeetingDocument = {
  userId: string;
  uploadedBy: string;
  customerName: string;
  companyName?: string;
  productType: string;
  customerType: "new" | "existing";
  recordedAt: Timestamp;
  location?: string;
  status: "considering" | "won" | "lost";
  audioFilePath?: string;
  audioDeletedAt?: Timestamp | null;
  audioMimeType: "audio/mpeg" | "audio/wav";
  durationSec?: number;
  processingStatus:
    | "uploaded"
    | "transcribing"
    | "analyzing"
    | "completed"
    | "failed";
  reanalysisCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `meetings/{meetingId}/transcript/current`

```ts
type TranscriptDocument = {
  fullText: string;
  salesText: string;
  customerText: string;
  language: string;
  summaryExcerpt?: string;
  segments: Array<{
    speaker: "sales" | "customer" | "unknown";
    startSec: number;
    endSec: number;
    text: string;
  }>;
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/metrics/current`

```ts
type MeetingMetricsDocument = {
  durationSec: number;
  salesTalkRatio: number;
  customerTalkRatio: number;
  salesCharacterCount: number;
  customerCharacterCount: number;
  questionCount: number;
  silenceSec?: number;
  keywordCounts: Record<string, number>;
  anxietyKeywordCounts: Record<string, number>;
  closingKeywordCounts: Record<string, number>;
  outcome: "considering" | "won" | "lost";
  manualScore: number;
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/manualChecks/current`

```ts
type ManualCheckDocument = {
  checklistVersionId: string;
  score: number;
  items: Array<{
    key: string;
    label: string;
    status: "ok" | "needs_improvement" | "ng";
    evidence?: string;
  }>;
  passedItems: string[];
  failedItems: string[];
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/aiComments/current`

```ts
type AICommentDocument = {
  goodPoints: string[];
  improvementPoints: string[];
  nextActions: string[];
  managerSummary: string;
  weakPointSummary?: string;
  promptVersion: string;
  createdAt: Timestamp;
};
```

### `meetingOutcomeHistory/{historyId}`

```ts
type MeetingOutcomeHistoryDocument = {
  meetingId: string;
  previousStatus?: "considering" | "won" | "lost";
  newStatus: "considering" | "won" | "lost";
  changedBy: string;
  changedAt: Timestamp;
  dealAmount?: number;
};
```

### `monthlyStats/{month}`

ドキュメントID例: `2026-05`

```ts
type MonthlyStatsDocument = {
  month: string;
  totalMeetingCount: number;
  totalWonMeetingCount: number;
  totalLostMeetingCount: number;
  averageDurationSec: number;
  productWinRates: Record<string, number>;
  topKeywords: Array<{ word: string; count: number }>;
  updatedAt: Timestamp;
};
```

### `userMonthlyStats/{userId_month}`

ドキュメントID例: `user_123_2026-05`

```ts
type UserMonthlyStatsDocument = {
  userId: string;
  month: string;
  meetingCount: number;
  wonMeetingCount: number;
  lostMeetingCount: number;
  consideringMeetingCount: number;
  winRate: number;
  averageDurationSec: number;
  averageManualScore: number;
  averageSalesTalkRatio: number;
  topKeywords: Array<{ word: string; count: number }>;
  lostKeywords: Array<{ word: string; count: number }>;
  updatedAt: Timestamp;
};
```

### `manualChecklists/{checklistId}`

```ts
type ManualChecklistDocument = {
  name: string;
  version: string;
  isActive: boolean;
  items: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeCategories/{categoryId}`

```ts
type KnowledgeCategoryDocument = {
  title: string;
  description: string;
  knowledgeCount: number;
  memoCount: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeProducts/{productId}`

```ts
type KnowledgeProductDocument = {
  name: string;
  knowledgeCount: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeItems/{knowledgeId}`

```ts
type KnowledgeItemDocument = {
  title: string;
  description: string;
  body: string;
  categoryId: string | null;
  productId: string | null;
  ownerId: string;
  scope: "personal" | "shared";
  kind: "knowledge" | "memo" | "qa";
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `users/{userId}/knowledgeSearchHistory/{historyId}`

```ts
type KnowledgeSearchHistoryDocument = {
  term: string;
  searchedAt: Timestamp;
};
```

## Indexing Guidance

- `meetings`: `userId + recordedAt desc`
- `meetings`: `processingStatus + createdAt desc`
- `meetings`: `status + recordedAt desc`
- `userMonthlyStats`: `userId + month desc`
- `knowledgeCategories`: `updatedAt desc`
- `knowledgeProducts`: `updatedAt desc`
- `knowledgeItems`: `scope`
- `knowledgeItems`: `ownerId`
- `users/{userId}/knowledgeSearchHistory`: `searchedAt desc`

## Retention Rule

- 音声本体は月30件超過時に最古の `audioFilePath` を削除
- `meetings` ドキュメント自体は削除しない
- `transcript`, `metrics`, `manualChecks`, `aiComments`, `meetingOutcomeHistory` は保持

## Async Processing Flow

1. Next.js で音声アップロード情報を登録
2. Storage に音声保存
3. `meetings.processingStatus = uploaded`
4. Cloud Run / Functions がジョブ取得
5. 文字起こし、数値分析、マニュアルチェック、AIコメント生成
6. 各サブコレクションを保存
7. `monthlyStats`, `userMonthlyStats` を更新
8. `meetings.processingStatus = completed`
