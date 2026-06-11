import { NextResponse } from "next/server";

import { assertCronRequest } from "@/lib/server/email";
import { sendWeeklyAdminReports } from "@/lib/server/email-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!assertCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendWeeklyAdminReports();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "週次メールの送信に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
