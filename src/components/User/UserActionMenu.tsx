"use client";
import * as React from "react";
import { User } from "@/types";
import { actions, useDispatch } from "@/store";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from "@mui/material";
import { Settings } from "lucide-react";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import useOrigin from "@/hooks/useOrigin";
import { useHandleValidation } from "@/hooks/useHandleValidation";

function UserActionMenu({ user }: { user: User }) {
  const dispatch = useDispatch();
  const isOnline = useOnlineStatus();
  const origin = useOrigin();
  const router = useRouter();
  // Raw router: this navigates to the user's *own* profile after a handle
  // change, to keep the address bar honest. There is no `user.open` command
  // because nothing else in the app navigates to a profile programmatically —
  // every other route there is a plain <Link>. See docs/plans/archive/workspace-panes.md
  // §3.2 for why a generic `navigate(url)` command is not the answer.
  const navigate = (path: string) => router.push(path);
  const pathname = usePathname();

  const [input, setInput] = useState<Partial<User>>({ handle: user.handle });
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const updateInput = (partial: Partial<User>) => {
    setInput((input) => ({ ...input, ...partial }));
  };

  const {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  } = useHandleValidation({
    currentHandle: user.handle,
    onChange: (value) => updateInput({ handle: value }),
    checkEndpoint: "/api/users/check",
  });

  useEffect(() => {
    setInput({ handle: user.handle });
    resetValidation();
  }, [user, editDialogOpen, resetValidation]);

  const openEditDialog = () => {
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeEditDialog();
    const shouldNavigate = pathname === `/user/${user.handle || user.id}`;
    const partial: Partial<User> = {};
    if (input.handle !== user.handle) partial.handle = input.handle || null;
    if (Object.keys(partial).length === 0) return;
    try {
      await dispatch(actions.updateUser({ id: user.id, partial })).unwrap();
      if (shouldNavigate) navigate(`/user/${input.handle || user.id}`);
    } catch {
      // update failed
    }
  };

  useFixedBodyScroll(editDialogOpen);

  return (
    <>
      <IconButton
        id="user-action-button"
        aria-label="User Actions"
        onClick={openEditDialog}
        size="small"
      >
        <Settings />
      </IconButton>
      <Dialog
        open={editDialogOpen}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="xs"
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          spellCheck="false"
        >
          <DialogTitle>Edit User</DialogTitle>
          <DialogContent
            sx={{
              "& .MuiFormHelperText-root": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          >
            <TextField
              margin="normal"
              size="small"
              fullWidth
              label="User Handle"
              disabled={!isOnline}
              value={input.handle || ""}
              onChange={updateHandle}
              error={!validating && !!validationErrors.handle}
              helperText={validating
                ? "Validating..."
                : validationErrors.handle
                ? validationErrors.handle
                : `${origin}/user/${input.handle || user.id}`}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDialog}>Cancel</Button>
            <Button
              type="submit"
              disabled={validating || hasErrors}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

export default UserActionMenu;
