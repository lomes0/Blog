"use client";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ViewDocument from "@/components/views/ViewDocument";
import htmr from "htmr";
import { Document, UserDocument } from "@/types";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { apiClient } from "@/api";
import { isReadmeDocument, README_DOCUMENT_NAME } from "@/constants";

interface ReadmeViewerProps {
  documents: UserDocument[];
}

interface ReadmeViewerState {
  cloudDocument: Document;
  html: string;
}

export default function ReadmeViewer({ documents }: ReadmeViewerProps) {
  const [readme, setReadme] = useState<ReadmeViewerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readmeDocId, setReadmeDocId] = useState<string | null>(null);
  const router = useRouter();
  const errorAnnounce = useErrorAnnounce();

  // Find README from documents OR fetch from API
  useEffect(() => {
    let cancelled = false;

    const findOrFetchReadme = async () => {
      // First, check if README is in documents
      const readmeDoc = documents.find((doc) => {
        const data = doc.cloud || doc.local;
        const name = data?.name || "";
        return isReadmeDocument(name);
      });

      if (readmeDoc) {
        if (!cancelled) setReadmeDocId(readmeDoc.id);
        return;
      }

      // README not in documents - try to fetch it from API
      try {
        const data = await apiClient.documents.list();
        if (cancelled) return;

        const readmeFromApi = data?.find((doc: Document) =>
          doc.name != null && isReadmeDocument(doc.name)
        );

        if (readmeFromApi) {
          setReadmeDocId(readmeFromApi.id);
        } else {
          setReadmeDocId(null);
          setLoading(false);
        }
      } catch (err) {
        errorAnnounce("Failed to fetch documents for README:", err);
        if (!cancelled) {
          setReadmeDocId(null);
          setLoading(false);
        }
      }
    };

    findOrFetchReadme();

    return () => {
      cancelled = true;
    };
  }, [documents, errorAnnounce]);

  // Fetch README HTML when we have the ID
  useEffect(() => {
    if (readmeDocId === null) {
      setReadme(null);
      setLoading(false);
      return;
    }

    if (!readmeDocId) {
      return;
    }

    let cancelled = false;

    const fetchReadmeHtml = async () => {
      setLoading(true);

      try {
        // Step 1: Fetch the document to get revision data
        const docResult = await apiClient.documents.get(readmeDocId);

        if (cancelled) return;

        if (!docResult?.data?.root || !docResult?.cloudDocument) {
          throw new Error("Invalid document data");
        }

        // Step 2: Use the embed API to generate HTML from the editor state
        const html = await apiClient.embed.render(docResult.data);

        if (cancelled) return;

        setReadme({
          cloudDocument: docResult.cloudDocument,
          html,
        });
      } catch (err) {
        errorAnnounce("Failed to fetch README:", err);
        if (!cancelled) setError("Failed to load README");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReadmeHtml();

    return () => {
      cancelled = true;
    };
  }, [readmeDocId, errorAnnounce]);

  const handleCreateReadme = () => {
    router.push(`/new?name=${README_DOCUMENT_NAME}`);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          gap: 2,
        }}
      >
        <Typography color="error">{error}</Typography>
        <Button variant="outlined" onClick={() => router.refresh()}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!readme) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          gap: 2,
          textAlign: "center",
          px: 3,
        }}
      >
        <FileText size={64} style={{ color: "var(--mui-palette-text-disabled)" }} />
        <Typography variant="h6" color="text.secondary">
          No README found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Create a README document to introduce your blog or workspace
        </Typography>
        <Button
          variant="contained"
          startIcon={<Plus />}
          onClick={handleCreateReadme}
        >
          Create README
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 4, px: 3 }}>
      <ViewDocument cloudDocument={readme.cloudDocument}>
        {htmr(readme.html)}
      </ViewDocument>
    </Box>
  );
}
