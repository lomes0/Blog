"use client";
import { useCallback, useMemo, useState } from "react";
import { validate } from "uuid";
import { debounce } from "@mui/material/utils";
import { PostCreateInput } from "@/types";
import { apiClient, ApiClientError } from "@/api";

interface UseHandleValidationParams {
  updateInput: (partial: Partial<PostCreateInput>) => void;
}

export function useHandleValidation(
  { updateInput }: UseHandleValidationParams,
) {
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const hasErrors = Object.keys(validationErrors).length > 0;

  const checkHandle = useMemo(
    () =>
      debounce(async (handle: string) => {
        try {
          await apiClient.documents.checkHandle(handle);
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
    [],
  );

  const updateHandle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const handle = event.target.value.trim().toLowerCase().replace(
        /[^A-Za-z0-9]/g,
        "-",
      );
      updateInput({ handle });
      if (!handle) return setValidationErrors({});
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
    },
    [updateInput, checkHandle],
  );

  return { validating, validationErrors, hasErrors, updateHandle };
}
