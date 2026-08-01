"use client";
import { useRouter } from "next/navigation";
import { actions, useDispatch, useSelector } from "@/store";
import React from "react";
import { Button, IconButton, Snackbar, Typography } from "@mui/material";
import { X } from "lucide-react";
import { signIn } from "next-auth/react";
import { ICON_SIZE } from "@/theme/icons";

function Announcer() {
  const announcement = useSelector((state) => state.ui.announcements[0]);
  const dispatch = useDispatch();
  const router = useRouter();
  // Raw router, and it has to be: `navigate` is injected into an announcement's
  // serialized `onClick` body (see `handleConfirm` below), which is a string
  // authored wherever the announcement was raised. The destination is opaque
  // here, so there is no command to route it through — and inventing a
  // `navigate(url)` command to cover it is exactly what plan §3.2 forbids.
  const navigate = (path: string) => router.push(path);
  // No provider argument: this is handed to announcement actions as a zero-arg
  // callback, so it routes to NextAuth's own sign-in page, which lists exactly
  // the providers that are configured. Naming one here is what previously left
  // the prompt pointing at a provider the server did not register.
  const login = () => signIn();

  const handleClose = () => dispatch(actions.clearAnnouncement());
  const handleConfirm = () => {
    const serializedAction = announcement?.action?.onClick;
    if (serializedAction) {
      const action = new Function(
        "dispatch",
        "actions",
        "navigate",
        "login",
        serializedAction,
      );
      action.bind(null, dispatch, actions, navigate, login)();
    }
    dispatch(actions.clearAnnouncement());
  };

  if (!announcement) return null;
  if (!announcement.message) return null;

  const message = (
    <>
      <Typography variant="subtitle2">
        {announcement.message.title}
      </Typography>
      {announcement.message.subtitle ? announcement.message.subtitle : null}
    </>
  );

  return (
    <Snackbar
      open
      autoHideDuration={announcement.timeout ?? 5000}
      onClose={handleClose}
      message={message}
      action={announcement.action
        ? (
          <>
            <Button
              color="secondary"
              size="small"
              onClick={handleConfirm}
            >
              {announcement.action.label}
            </Button>
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleClose}
            >
              <X size={ICON_SIZE.dense} />
            </IconButton>
          </>
        )
        : null}
    />
  );
}

export default Announcer;
