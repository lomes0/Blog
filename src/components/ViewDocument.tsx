"use client";
import { CloudDocument, User } from "@/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const ViewDocumentInfo = dynamic(
  () => import("@/components/ViewDocumentInfo"),
  { ssr: false },
);

const ViewDocument: React.FC<
  React.PropsWithChildren & { cloudDocument: CloudDocument; user?: User }
> = ({ cloudDocument, children }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const handle = cloudDocument.handle || cloudDocument.id;
  const isAuthor = cloudDocument.author.id === user?.id;
  const isCollab = cloudDocument.collab;
  const isEditable = isAuthor || isCollab;

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditable) {
      router.push(`/edit/${handle}`);
    }
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        minHeight: "100vh",
      }}
      title={isEditable ? "Double-click to edit document" : undefined}
    >
      <div className="document-container">
        {children}
      </div>
      <ViewDocumentInfo cloudDocument={cloudDocument} user={user} />
    </div>
  );
};

export default ViewDocument;
