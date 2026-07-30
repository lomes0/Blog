"use client";
import { useCallback } from "react";
import { v4 as uuid } from "uuid";
import { actions, useDispatch } from "@/store";

export interface ConfirmRequest {
  title: string;
  content: string;
  /** Label of the affirmative button. */
  confirmLabel: string;
  /** Label of the dismissive button. */
  cancelLabel?: string;
}

/**
 * Ask the user to confirm a destructive action, resolving to whether they did.
 *
 * `actions.alert` resolves to the *id* of the button that was clicked (or null
 * when the dialog is dismissed), so every call site had to mint two uuids, hand
 * them to the payload, and then compare the response against the right one by
 * array index. That comparison is the only part that matters and the only part
 * that can be got wrong, so it lives here once. Dismissing the dialog counts as
 * declining, exactly as the hand-rolled `payload !== confirmId` did.
 */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const dispatch = useDispatch();

  return useCallback(
    async ({ title, content, confirmLabel, cancelLabel = "Cancel" }) => {
      const confirmId = uuid();
      const response = await dispatch(
        actions.alert({
          title,
          content,
          actions: [
            { label: cancelLabel, id: uuid() },
            { label: confirmLabel, id: confirmId },
          ],
        }),
      );
      return response.payload === confirmId;
    },
    [dispatch],
  );
}
