"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import * as React from "react";
import { Post, PostCreateInput, User } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "@/store";
import DocumentCard from "./DocumentCard";
import {
  Avatar,
  Box,
  Button,
  Container,
  FormHelperText,
  TextField,
  Typography,
} from "@mui/material";
import { FileText, Plus } from "lucide-react";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import UsersAutocomplete from "./User/UsersAutocomplete";
import { getEditorData } from "@/utils/getEditorData";
import { useHandleValidation } from "@/hooks/useHandleValidation";
import DocumentVisibilityFields from "./DocumentActions/DocumentVisibilityFields";
import { capabilities } from "@/lib/capabilities";
import { useCreateDocumentActions } from "@/hooks/useCreateDocumentActions";

const NewDocument: React.FC<{ cloudDocument?: Post }> = (
  { cloudDocument },
) => {
  const initialized = useSelector((state) => state.ui.initialized);
  const { user, forkDocument, createDocument } = useCreateDocumentActions();
  const unauthenticated = initialized && !user;
  const can = capabilities(user);
  const isOnline = useOnlineStatus();
  const [input, setInput] = useState<Partial<PostCreateInput>>({
    published: true,
  });
  const pathname = usePathname();
  const baseId = pathname.split("/")[2]?.toLowerCase();
  const searchParams = useSearchParams();
  const revisionId = searchParams.get("v");
  const parentId = searchParams.get("parentId");
  const seriesId = searchParams.get("seriesId");
  const [base, setBase] = useState<Post | undefined>(
    cloudDocument,
  );

  const updateInput = useCallback((partial: Partial<PostCreateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  }, []);

  const { validating, validationErrors, hasErrors, updateHandle } =
    useHandleValidation({ updateInput });

  useEffect(() => {
    const loadDocument = async (id: string) => {
      const source = await forkDocument(id, revisionId);
      if (!source) return;
      setBase(source);
      setInput((prev) => ({ ...prev, data: source.data, baseId: source.id }));
    };
    if (baseId) loadDocument(baseId);
  }, [baseId, revisionId, forkDocument]);

  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = input.name || "Untitled Document";
    const data = input.data || getEditorData();
    const createdAt = new Date().toISOString();
    const payload: PostCreateInput = {
      ...input,
      id: uuidv4(),
      head: uuidv4(),
      name,
      data,
      type: "DOCUMENT",
      parentId: parentId || null,
      seriesId: seriesId || null,
      createdAt,
      updatedAt: createdAt,
    };
    try {
      await createDocument(payload);
      router.refresh();
      router.push(`/edit/${payload.id}`);
    } catch {
      // the thunk already announced the failure
    }
  };

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    updateInput({ coauthors });
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
            <DocumentCard post={base} user={user} sx={{ width: 396 }} />
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
          <TextField
            margin="normal"
            size="small"
            fullWidth
            autoFocus
            label="Document Name"
            value={input.name || ""}
            onChange={(e) => updateInput({ name: e.target.value })}
            sx={{ "& .MuiInputBase-root": { height: 40 } }}
          />
          <TextField
            margin="normal"
            size="small"
            fullWidth
            multiline
            rows={3}
            label="Description"
            placeholder="A brief description of your document (optional)"
            value={input.description || ""}
            onChange={(e) => updateInput({ description: e.target.value })}
            helperText="This description will appear in document previews and help with SEO"
            sx={{
              "& .MuiInputBase-root": {
                minHeight: 80,
                alignItems: "flex-start",
                padding: "8px 12px",
              },
              "& .MuiInputBase-input": { resize: "vertical" },
            }}
          />
          <TextField
            margin="normal"
            size="small"
            fullWidth
            label="Document Handle"
            disabled={!isOnline}
            value={input.handle || ""}
            onChange={updateHandle}
            error={!validating && !!validationErrors.handle}
            helperText={validating
              ? "Validating..."
              : validationErrors.handle
              ? validationErrors.handle
              : input.handle
              ? `https://matheditor.me/view/${input.handle}`
              : "This will be used in the URL of your document"}
          />

          {unauthenticated && (
            <FormHelperText sx={{ mb: 1 }}>
              You are not signed in — this document is saved in this browser
              only. Sign in to keep it in your account.
            </FormHelperText>
          )}

          {can.coauthors && (
            <UsersAutocomplete
              label="Coauthors"
              placeholder="Email"
              value={input.coauthors ?? []}
              onChange={updateCoauthors}
              sx={{ my: 2 }}
              disabled={!isOnline}
            />
          )}
          {can.publish && (
            <DocumentVisibilityFields
              isPrivate={input.private}
              isPublished={input.published ?? true}
              isCollab={input.collab}
              disabled={!isOnline}
              onChange={(partial) => updateInput(partial)}
            />
          )}

          <Button
            type="submit"
            disabled={!!(baseId && !base) || validating || hasErrors}
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
