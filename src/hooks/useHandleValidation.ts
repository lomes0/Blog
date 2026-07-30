"use client";
import { useCallback, useMemo, useState } from "react";
import { validate } from "uuid";
import { debounce } from "@mui/material/utils";
import { apiClient, ApiClientError } from "@/api";

interface UseHandleValidationOptions {
  /** Called on every keystroke with the normalized handle. */
  onChange: (handle: string) => void;
  /**
   * The handle this row already owns, if any. Typing it back is not a
   * conflict, so it skips the availability check — otherwise an edit dialog
   * reports the row as taken by itself.
   */
  currentHandle?: string | null;
  /** Availability endpoint. Users have their own; documents are the default. */
  checkEndpoint?: string;
}

/**
 * Shared handle field behaviour: normalize, reject locally what the server
 * would reject anyway, then debounce an availability check.
 *
 * One hook for every handle in the app — documents and user profiles alike —
 * so the rules a handle must satisfy are stated once.
 */
export function useHandleValidation({
  onChange,
  currentHandle = null,
  checkEndpoint = "/api/documents/check",
}: UseHandleValidationOptions) {
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const hasErrors = Object.keys(validationErrors).length > 0;

  const resetValidation = useCallback(() => {
    setValidating(false);
    setValidationErrors({});
  }, []);

  const checkHandle = useMemo(
    () =>
      debounce(async (handle: string) => {
        try {
          await apiClient.documents.checkHandle(handle, checkEndpoint);
          setValidationErrors({});
        } catch (err) {
          if (err instanceof ApiClientError && err.details) {
            const { title, subtitle } = err.details;
            setValidationErrors({
              handle: subtitle ? `${title}: ${subtitle}` : title,
            });
          } else {
            setValidationErrors({
              handle: "Something went wrong: Please try again later",
            });
          }
        }
        setValidating(false);
      }, 500),
    [checkEndpoint],
  );

  const updateHandle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const handle = event.target.value.trim().toLowerCase().replace(
      /[^A-Za-z0-9]/g,
      "-",
    );
    onChange(handle);
    if (!handle || handle === currentHandle) return setValidationErrors({});
    if (handle.length < 3) {
      return setValidationErrors({
        handle:
          "Handle is too short: Handle must be at least 3 characters long",
      });
    }
    if (!/^[a-zA-Z0-9-]+$/.test(handle)) {
      return setValidationErrors({
        handle:
          "Invalid Handle: Handle must only contain letters, numbers, and hyphens",
      });
    }
    if (validate(handle)) {
      return setValidationErrors({
        handle: "Invalid Handle: Handle must not be a UUID",
      });
    }
    setValidating(true);
    checkHandle(handle);
  };

  return {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  };
}
