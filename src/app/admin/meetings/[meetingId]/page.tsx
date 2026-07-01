import { MeetingDetailScreen } from "@/features/meetings/meeting-detail-screen";

type AdminMeetingDetailPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function AdminMeetingDetailPage({
  params,
}: AdminMeetingDetailPageProps) {
  const { meetingId } = await params;

  return <MeetingDetailScreen meetingId={meetingId} view="summary" />;
}
