# Firestore Collection Design

MVPでは「通話ごとの原本」と「表示用の集計済みデータ」を分けて持ちます。
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

### `calls/{callId}`

```ts
type CallDocument = {
  userId: string;
  uploadedBy: string;
  customerName: string;
  companyName?: string;
  productType: string;
  customerType: "new" | "existing";
  recordedAt: Timestamp;
  location?: string;
  status: "considering" | "won" | "lost";
  speakerAssignment: "sales_speaker_a" | "sales_speaker_b";
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

### `calls/{callId}/transcript/current`

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

### `calls/{callId}/metrics/current`

```ts
type CallMetricsDocument = {
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

### `calls/{callId}/manualChecks/current`

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

### `calls/{callId}/aiComments/current`

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

### `callOutcomeHistory/{historyId}`

```ts
type CallOutcomeHistoryDocument = {
  callId: string;
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
  totalCallCount: number;
  totalWonCount: number;
  totalLostCount: number;
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
  callCount: number;
  wonCount: number;
  lostCount: number;
  consideringCount: number;
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

## Indexing Guidance

- `calls`: `userId + recordedAt desc`
- `calls`: `processingStatus + createdAt desc`
- `calls`: `status + recordedAt desc`
- `userMonthlyStats`: `userId + month desc`

## Retention Rule

- 音声本体は月30件超過時に最古の `audioFilePath` を削除
- `calls` ドキュメント自体は削除しない
- `transcript`, `metrics`, `manualChecks`, `aiComments`, `callOutcomeHistory` は保持

## Async Processing Flow

1. Next.js で音声アップロード情報を登録
2. Storage に音声保存
3. `calls.processingStatus = uploaded`
4. Cloud Run / Functions がジョブ取得
5. 文字起こし、数値分析、マニュアルチェック、AIコメント生成
6. 各サブコレクションを保存
7. `monthlyStats`, `userMonthlyStats` を更新
8. `calls.processingStatus = completed`
