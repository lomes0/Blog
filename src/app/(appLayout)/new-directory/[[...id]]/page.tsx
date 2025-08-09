import type { Metadata } from "next";
import NewDirectory from "@/components/NewDirectory";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { cache } from "react";

const getCachedSession = cache(async () => await getServerSession(authOptions));

export const metadata: Metadata = {
  title: "New Directory",
  description: "Create a new directory on Editor",
};

export default async function Page(
  props: { 
    params: Promise<{ id?: string[] }>; 
    searchParams: Promise<{ domain?: string; domainSlug?: string }>;
  },
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const parentId = params.id?.[0] || undefined;
  const domainId = searchParams.domain;
  const domainSlug = searchParams.domainSlug;

  return <NewDirectory parentId={parentId} domainId={domainId} domainSlug={domainSlug} />;
}
