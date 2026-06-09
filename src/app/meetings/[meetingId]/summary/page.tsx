import { MeetingDetailScreen } from "@/features/meetings/meeting-detail-screen";

type MeetingSummaryPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function MeetingSummaryPage({
  params,
}: MeetingSummaryPageProps) {
  const { meetingId } = await params;

  return <MeetingDetailScreen meetingId={meetingId} view="summary" />;
}
