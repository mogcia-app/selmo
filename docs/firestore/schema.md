# Firestore Collection Design

MVPでは「打ち合わせごとの原本」と「表示用の集計済みデータ」を分けて持ちます。
Firestoreは重い集計が得意ではないため、管理画面は `monthlyStats` や `userMonthlyStats` を参照する前提です。

## Collections

### `users/{userId}`

```ts
type UserDocument = {
  name: string;
  email: string;
  companyId?: string;
  companyName?: string;
  role: "admin" | "sales";
  status: "active" | "inactive";
  enabledSalesDomains?: {
    meeting?: boolean; // 未設定時は true 扱い
    teleapo?: boolean; // 未設定時は true 扱い
  };
  teamId?: string;
  adminCoachingStatus?: "none" | "watch" | "needs_coaching";
  adminCoachingPriority?: "low" | "medium" | "high";
  adminCoachingReason?: string;
  adminNextActionTitle?: string;
  adminNextActionNote?: string;
  adminNextActionDueDate?: Timestamp | null;
  adminNextActionUpdatedAt?: Timestamp;
  adminNextActionUpdatedBy?: string;
  adminReviewStatus?: "unchecked" | "checked" | "in_progress" | "follow_up" | "done";
  adminLastReviewedAt?: Timestamp;
  adminNextReviewDate?: Timestamp | null;
  adminReviewMemo?: string;
  adminReviewUpdatedAt?: Timestamp;
  adminReviewUpdatedBy?: string;
  nextCoachingMemo?: string;
  nextCoachingMemoUpdatedAt?: Timestamp;
  nextCoachingMemoUpdatedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `companies/{companyId}`

```ts
type CompanyDocument = {
  name: string;
  monthlyFee: number;
  contractStartDate: Timestamp;
  billingCurrency: "JPY";
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `meetings/{meetingId}`

```ts
type MeetingDocument = {
  companyId?: string;
  userId: string;
  uploadedBy: string;
  salesDomain?: "meeting" | "teleapo"; // 未設定時は meeting 扱い
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

### `aiUsageLogs/{logId}`

```ts
type AiUsageLogDocument = {
  companyId: string;
  userId: string;
  feature:
    | "transcription"
    | "summary"
    | "analysis"
    | "roleplay"
    | "knowledge_search";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioDurationSec?: number;
  estimatedCostUsd?: number;
  createdAt: Timestamp;
  status: "success" | "failed";
  errorMessage?: string;
};
```

### `knowledgeSearchEvents/{eventId}`

```ts
type KnowledgeSearchEventDocument = {
  companyId: string;
  userId: string;
  query: string;
  resultCount: number;
  usedAi: boolean;
  createdAt: Timestamp;
};
```

### `systemErrors/{errorId}`

```ts
type SystemErrorDocument = {
  companyId?: string;
  userId?: string;
  kind: "OpenAI" | "Firebase" | "Storage" | "Cloud Run" | "Auth" | "API";
  message: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "investigating" | "resolved";
  occurredAt: Timestamp;
  source?: string;
};
```

### `audioProcessingJobs/{jobId}`

```ts
type AudioProcessingJobDocument = {
  companyId: string;
  userId: string;
  meetingId: string;
  fileName: string;
  audioDurationSec: number;
  status:
    | "waiting"
    | "uploading"
    | "convert_required"
    | "converting"
    | "converted"
    | "transcribing"
    | "analyzing"
    | "completed"
    | "failed";
  startedAt: Timestamp;
  completedAt?: Timestamp | null;
  errorMessage?: string | null;
  retryCount: number;
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

### `customers/{customerId}`

```ts
type CustomerDocument = {
  companyId: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  employeeCount: number | null;
  assignedUserId: string;
  assignedUserName: string;
  productIds: string[];
  productNames: string[];
  status:
    | "not_contacted"
    | "called"
    | "meeting_scheduled"
    | "meeting_done"
    | "proposal"
    | "contracted"
    | "lost"
    | "dormant";
  temperature: "high" | "middle" | "low";
  expectedAmount: number | null;
  lostReason: string;
  nextActionTitle: string;
  nextActionDate: Timestamp | null;
  lastContactDate: Timestamp | null;
  memo: string;
  isContracted: boolean;
  contractStatus:
    | "not_contracted"
    | "considering"
    | "needs_consultation"
    | "contracted"
    | "paused"
    | "cancelled";
  contractStartDate: Timestamp | null;
  contractPlan: string;
  monthlyAmount: number | null;
  renewalDate: Timestamp | null;
  churnRisk: "high" | "middle" | "low";
  createdAt: Timestamp;
  updatedAt: Timestamp;
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

### `salesManuals/{manualId}`

```ts
type SalesManualDocument = {
  companyId: string;
  manualDomain?: "meeting" | "teleapo"; // 未設定時は meeting 扱い
  title: string;
  productId: string | null;
  productName: string;
  manualCategory: "新規" | "既存" | "";
  targetSegment: string;
  content: string;
  criteria: string[];
  requiredQuestions: string[];
  scoringRules: string[];
  objectionHandling: string[];
  closingRules: string[];
  customFields: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  status: "active" | "draft";
  createdBy: string;
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
  logoUrl?: string;
  logoStoragePath?: string;
  knowledgeCount: number;
  tabs: string[];
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
  tabTitle: string;
  categoryId: string | null;
  productId: string | null;
  ownerId: string;
  scope: "personal" | "shared";
  kind: "knowledge" | "memo" | "qa";
  tags: string[];
  links: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    storagePath: string;
    contentType: string;
    size: number;
    uploadedAt: Timestamp;
    uploadedBy: string;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

作成フロー:

- 営業ユーザーは `scope: "personal"` のナレッジ、メモ、Q&Aを作成できます。
- 管理者は `scope: "shared"` の共有ナレッジを作成できます。
- `categoryId` または `productId` が指定された場合、作成トランザクション内で `knowledgeCategories` / `knowledgeProducts` の件数と `updatedAt` を更新します。
- 画面上の初期カテゴリ `how-to` はアプリ内の固定カテゴリです。Firestore 上にカテゴリドキュメントがないため、カウンター更新対象には含めません。
- HPや外部ページは `links` に保存します。
- PDFなどの添付ファイルは Firebase Storage の `knowledge/{userId}/{knowledgeId}/attachments/*` に保存し、Firestore には参照メタ情報のみ保存します。
- 商品別ページでは `knowledgeProducts.tabs` を商品共通のタブ一覧として表示し、各ナレッジの `tabTitle` が一致するタブへ自動で入ります。
- 共有ナレッジも同じ `productId` と `tabTitle` を持っていれば、商品ページの同じタブ内に表示されます。

### `users/{userId}/knowledgeSearchHistory/{historyId}`

```ts
type KnowledgeSearchHistoryDocument = {
  term: string;
  searchedAt: Timestamp;
};
```

### `roleplayScenarios/{scenarioId}`

```ts
type RoleplayScenarioDocument = {
  companyId: string;
  roleplayType?: "meeting" | "teleapo"; // 未設定時は meeting 扱い
  title: string;
  description: string;
  productId: string | null;
  productName: string;
  scenarioCategory: "新規" | "既存" | "";
  targetSegment: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  customFields: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  difficulty: "easy" | "normal" | "hard";
  visibility: "draft" | "all";
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `roleplayResults/{resultId}`

```ts
type RoleplayResultDocument = {
  scenarioId: string;
  scenarioTitle: string;
  productName: string;
  userId: string;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  messages: Array<{
    role: "customer" | "sales";
    content: string;
    createdAt: string;
  }>;
  createdAt: Timestamp;
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
- `roleplayScenarios`: クライアント側で `updatedAt desc` に整列
- `roleplayResults`: クライアント側で `createdAt desc` に整列
- `roleplayResults`: `userId`

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
