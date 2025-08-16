import { notFound } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DomainEditForm from "@/components/Domain/DomainEditForm";

// Generate dynamic metadata for the domain edit page
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  try {
    const domain = await prisma.domain.findUnique({
      where: { id },
    });

    if (!domain) {
      return {
        title: "Domain Not Found",
      };
    }

    return {
      title: `Edit ${domain.name} - Editor`,
      description: `Edit settings for ${domain.name} domain`,
    };
  } catch (error) {
    console.error("Error fetching domain metadata:", error);
    return {
      title: "Edit Domain - Editor",
    };
  }
}

export const dynamic = "force-dynamic";

export default async function EditDomainPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  if (!session) {
    return notFound();
  }

  const domain = await prisma.domain.findUnique({
    where: { id },
  });

  if (!domain) {
    return notFound();
  }

  // Check if the user has access to this domain
  if (domain.userId !== session.user.id) {
    return notFound();
  }

  return <DomainEditForm domain={domain} />;
}
