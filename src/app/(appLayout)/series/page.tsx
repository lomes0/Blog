import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findAllSeries } from "@/repositories/series";
import SeriesGrid from "@/components/SeriesGrid";
import { NewSeriesButton } from "@/components/SeriesActions";

export default async function SeriesPage() {
  const session = await getServerSession(authOptions);
  const series = await findAllSeries();

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">All Series</h1>
        {session && <NewSeriesButton />}
      </div>
      <SeriesGrid series={series} />
    </div>
  );
}
