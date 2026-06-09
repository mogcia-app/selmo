import { MeetingDetailScreen } from "@/features/meetings/meeting-detail-screen";

type MeetingDetailPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function MeetingDetailPage({
  params,
}: MeetingDetailPageProps) {
  const { meetingId } = await params;

  return <MeetingDetailScreen meetingId={meetingId} view="transcript" />;
}
