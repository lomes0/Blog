"use client";
import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { useAIModel } from "@/contexts/AIModelContext";
import {
  AI_PROVIDER_LABEL,
  AI_PROVIDERS,
  type AIProviderType,
  providerRequiresKey,
} from "@/lib/ai/types";
import { ICON_SIZE } from "@/theme/icons";

/**
 * The user's own AI provider keys, in Settings —
 * docs/plans/byo-provider-keys.md phase 3.
 *
 * Ollama is filtered out rather than shown as "no key needed": it authenticates
 * with nothing, so a row for it would be a control with no action behind it.
 * The route refuses a key for it too, on the same reasoning.
 */
const KEYED_PROVIDERS = AI_PROVIDERS.filter(providerRequiresKey);

const ProviderKeys: React.FC = () => {
  const {
    providerKeys,
    providerKeysState,
    providerKeysError,
    refreshProviderKeys,
  } = useAIModel();

  /** Which row has its input open. Only one at a time — this is a settings list. */
  const [editing, setEditing] = useState<AIProviderType | null>(null);
  const [draft, setDraft] = useState("");
  /** Which row is mid-request, so its buttons can be disabled rather than merely dimmed. */
  const [busy, setBusy] = useState<AIProviderType | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const keyFor = (provider: AIProviderType) =>
    providerKeys.find((key) => key.provider === provider);

  const openEditor = (provider: AIProviderType) => {
    setEditing(provider);
    setDraft("");
    setRowError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setDraft("");
    setRowError(null);
  };

  /** The server's own wording, which is the only thing that knows why it refused. */
  const messageFrom = async (response: Response, fallback: string) => {
    try {
      const body = await response.json();
      return body?.error?.subtitle ?? body?.error?.title ?? fallback;
    } catch {
      return fallback;
    }
  };

  const save = async (provider: AIProviderType) => {
    const apiKey = draft.trim();
    if (!apiKey) return;
    setBusy(provider);
    setRowError(null);
    try {
      const response = await fetch(`/api/ai/credentials/${provider}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) {
        setRowError(await messageFrom(response, "That key could not be saved"));
        return;
      }
      await refreshProviderKeys();
      closeEditor();
    } catch {
      setRowError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: AIProviderType) => {
    setBusy(provider);
    setRowError(null);
    try {
      const response = await fetch(`/api/ai/credentials/${provider}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setRowError(await messageFrom(response, "That key could not be removed"));
        return;
      }
      await refreshProviderKeys();
    } catch {
      setRowError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  };

  if (providerKeysState === "loading") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {KEYED_PROVIDERS.map((provider) => (
          <Skeleton key={provider} variant="rounded" height={36} />
        ))}
      </Box>
    );
  }

  if (providerKeysState === "signed-out") {
    return (
      <Typography variant="body2" color="text.secondary">
        Sign in to store your own provider keys. They are kept with your account,
        encrypted, and never shown again once saved.
      </Typography>
    );
  }

  if (providerKeysState === "error") {
    return (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => void refreshProviderKeys()}
          >
            Retry
          </Button>
        }
      >
        {providerKeysError ?? "Could not load your provider keys"}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        AI features run on your own provider account. A key is encrypted before
        it is stored and is never shown again.
      </Typography>

      {rowError && (
        <Alert severity="error" onClose={() => setRowError(null)}>
          {rowError}
        </Alert>
      )}

      {KEYED_PROVIDERS.map((provider) => {
        const stored = keyFor(provider);
        const isEditing = editing === provider;
        const isBusy = busy === provider;

        return (
          <Box key={provider} sx={{ py: 0.5 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                {/* State is carried by the icon and the text below, not by colour
                    alone — DESIGN.md §10. */}
                {stored
                  ? <Check size={ICON_SIZE.dense} />
                  : <KeyRound size={ICON_SIZE.dense} />}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">
                    {AI_PROVIDER_LABEL[provider]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stored ? `••••${stored.last4}` : "No key"}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {!isEditing && (
                  <Button
                    size="small"
                    variant="text"
                    disabled={isBusy}
                    onClick={() => openEditor(provider)}
                  >
                    {stored ? "Replace" : "Add key"}
                  </Button>
                )}
                {stored && !isEditing && (
                  <Tooltip title="Remove">
                    <span>
                      <IconButton
                        size="small"
                        disabled={isBusy}
                        onClick={() => void remove(provider)}
                        aria-label={`Remove the ${AI_PROVIDER_LABEL[provider]} key`}
                      >
                        {isBusy
                          ? <CircularProgress size={16} />
                          : <Trash2 size={ICON_SIZE.dense} />}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {isEditing && (
              <Box
                component="form"
                onSubmit={(event: React.FormEvent) => {
                  event.preventDefault();
                  void save(provider);
                }}
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <TextField
                  autoFocus
                  fullWidth
                  size="small"
                  // A password field, so a key pasted with someone looking over
                  // the shoulder is not on screen. There is no reveal toggle:
                  // the round trip to the provider is what confirms it was
                  // typed correctly, and it happens before anything is stored.
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={isBusy}
                  label={`${AI_PROVIDER_LABEL[provider]} API key`}
                  placeholder="Paste the key"
                />
                <Button
                  type="submit"
                  size="small"
                  variant="contained"
                  disabled={isBusy || !draft.trim()}
                  startIcon={isBusy
                    ? <CircularProgress size={14} color="inherit" />
                    : undefined}
                >
                  {isBusy ? "Checking" : "Save"}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  disabled={isBusy}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default ProviderKeys;
