"use client";
import { User } from "@/types";
import { signOut } from "next-auth/react";
import { Button } from "@mui/material";
import { useSelector } from "@/store";
import LoginButtons from "./LoginButtons";

/**
 * The sign-in / sign-out half of {@link UserCard}.
 *
 * Split out because `UserCard` also renders on `/user/[id]`, which moved to the
 * `(public)` route group and has no Redux store (plan §8.1). `initialized` is
 * the only store read the card had left, and it only ever mattered under
 * `showActions` — which today means the dashboard, inside the workspace. So the
 * read moves into a component that is only mounted there, rather than the card
 * carrying a store dependency it uses on one of its three call sites.
 */
const UserSessionActions: React.FC<{ user?: User }> = ({ user }) => {
  const initialized = useSelector((state) => state.ui.initialized);

  if (user) {
    return (
      <Button size="small" onClick={() => signOut()}>
        Logout
      </Button>
    );
  }
  return initialized ? <LoginButtons size="small" /> : null;
};

export default UserSessionActions;
