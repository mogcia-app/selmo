# MVP Directory Structure

```txt
selmo/
├─ docs/
│  ├─ architecture/
│  │  └─ mvp-structure.md
│  └─ firestore/
│     └─ schema.md
├─ src/
│  ├─ app/
│  │  ├─ admin/dashboard/page.tsx
│  │  ├─ meetings/[meetingId]/page.tsx
│  │  ├─ sales/dashboard/page.tsx
│  │  ├─ layout.tsx
│  │  ├─ page.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  └─ stat-card.tsx
│  ├─ features/
│  │  └─ dashboard/components/dashboard-table.tsx
│  ├─ lib/
│  │  ├─ config/app.ts
│  │  └─ firebase/client.ts
│  └─ types/
│     └─ domain.ts
├─ .env.example
├─ package.json
├─ tailwind.config.ts
└─ tsconfig.json
```

## Intent

- `app`: 画面ルーティングとページの入り口
- `components`: ドメインに閉じないUI部品
- `features`: 管理画面、アップロード、打ち合わせ詳細などの単位で機能を分割
- `lib`: Firebase設定や共通関数
- `types`: Firestoreドキュメント、API、UI間で共有する型
- `docs`: コレクション設計やアーキテクチャ判断を残す

## Recommended Next Additions

- `src/features/auth`
- `src/features/meetings`
- `src/features/manual-checks`
- `src/features/comments`
- `src/server`
- `src/app/api`
