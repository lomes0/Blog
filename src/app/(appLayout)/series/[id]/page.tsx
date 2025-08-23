import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findSeriesById } from "@/repositories/series";
import SeriesView from "@/components/SeriesView";
import { SeriesActions } from "@/components/SeriesActions";

interface SeriesDetailPageProps {
  params: { id: string };
}

export default async function SeriesDetailPage(
  { params }: SeriesDetailPageProps,
) {
  const session = await getServerSession(authOptions);
  const series = await findSeriesById(params.id);

  if (!series) {
    notFound();
  }

  const canEdit = session?.user?.id === series.authorId;

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-start mb-8">
        <SeriesView series={series} user={session?.user} />
        {canEdit && <SeriesActions seriesId={series.id} />}
      </div>
    </div>
  );
}
