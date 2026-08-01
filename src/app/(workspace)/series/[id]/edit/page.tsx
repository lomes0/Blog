import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { findSeriesById } from "@/repositories/series";
import { EditSeriesForm } from "@/components/SeriesActions";

// Force dynamic rendering to check session on every request
export const dynamic = "force-dynamic";

interface EditSeriesPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSeriesPage({ params }: EditSeriesPageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/api/auth/signin");
  }

  const series = await findSeriesById(id);

  if (!series) {
    notFound();
  }

  if (session.user?.id !== series.authorId) {
    redirect(`/series/${id}`);
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <EditSeriesForm series={series} />
    </div>
  );
}
