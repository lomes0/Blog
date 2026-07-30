"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useEffect, useState } from "react";
import { Post } from "@/types";
import DocumentCard from "./DocumentCard";
import { Avatar, Box, Button, Container, Typography } from "@mui/material";
import { FileText, Plus } from "lucide-react";
import { useCreatePostForm } from "@/hooks/useCreatePostForm";
import PostFormFields from "./DocumentActions/PostFormFields";

const NewDocument: React.FC<{ cloudDocument?: Post }> = (
  { cloudDocument },
) => {
  const pathname = usePathname();
  const baseId = pathname.split("/")[2]?.toLowerCase();
  const searchParams = useSearchParams();
  const revisionId = searchParams.get("v");
  const parentId = searchParams.get("parentId");
  const seriesId = searchParams.get("seriesId");

  const form = useCreatePostForm({ parentId, seriesId });
  const { seedFrom } = form;
  const [base, setBase] = useState<Post | undefined>(cloudDocument);

  useEffect(() => {
    if (!baseId) return;
    let current = true;
    seedFrom(baseId, revisionId).then((source) => {
      if (current && source) setBase(source);
    });
    return () => {
      current = false;
    };
  }, [baseId, revisionId, seedFrom]);

  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await form.submit();
    if (!result.ok) return;
    router.refresh();
    router.push(`/edit/${result.id}`);
  };

  return (
    <Container maxWidth="xs" sx={{ flex: 1 }}>
      <Box
        sx={{
          mt: 5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Avatar sx={{ my: 2, bgcolor: "primary.main" }}>
          <FileText />
        </Avatar>
        <Typography component="h1" variant="h5">
          {baseId ? "Fork a document" : "Create a new document"}
        </Typography>
        {baseId && (
          <>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", my: 1 }}
            >
              Based on
            </Typography>
            <DocumentCard post={base} user={form.user} sx={{ width: 396 }} />
          </>
        )}
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          spellCheck="false"
          sx={{ mt: 1 }}
        >
          <PostFormFields form={form} />

          <Button
            type="submit"
            disabled={!!(baseId && !base) || !form.canSubmit}
            fullWidth
            variant="contained"
            startIcon={<Plus />}
            sx={{ my: 2 }}
          >
            Create
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default NewDocument;
