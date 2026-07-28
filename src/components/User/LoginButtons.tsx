"use client";

import { signIn } from "next-auth/react";
import { Button, Typography } from "@mui/material";
import { LogIn } from "lucide-react";
import GoogleIcon from "./GoogleIcon";
import GitHubIcon from "./GitHubIcon";
import { ICON_SIZE } from "@/theme/icons";
import { useAuthProviders } from "@/hooks/useAuthProviders";

/**
 * One sign-in button per configured provider. Follows DESIGN.md conventions:
 * icons use ICON_SIZE tokens (§16) rather than raw pixel values, and the label
 * truncates rather than wrapping so the button keeps its row height.
 *
 * Rendering from `useAuthProviders` rather than a hardcoded list is what keeps
 * the button from offering a provider the server cannot actually serve.
 */

const providerIcon = (id: string) => {
  switch (id) {
    case "google":
      return <GoogleIcon size={ICON_SIZE.dense} />;
    case "github":
      return <GitHubIcon size={ICON_SIZE.dense} />;
    default:
      return <LogIn size={ICON_SIZE.dense} />;
  }
};

const LoginButtons: React.FC<{ size?: "small" | "medium" | "large" }> = (
  { size = "small" },
) => {
  const { providers, loading } = useAuthProviders();

  // Say nothing while the list is in flight — a flash of "unavailable" that
  // resolves into buttons reads as a bug.
  if (loading) return null;

  // No provider configured is an operator error, not something the visitor can
  // act on. The button still routes to NextAuth's own page, which explains it.
  if (providers.length === 0) {
    return (
      <Button
        size={size}
        startIcon={<LogIn size={ICON_SIZE.dense} />}
        onClick={() => signIn()}
      >
        <Typography variant="button" noWrap>
          Login
        </Typography>
      </Button>
    );
  }

  return (
    <>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          size={size}
          startIcon={providerIcon(provider.id)}
          onClick={() =>
            signIn(provider.id, undefined, { prompt: "select_account" })}
        >
          <Typography variant="button" noWrap>
            Login with {provider.name}
          </Typography>
        </Button>
      ))}
    </>
  );
};

export default LoginButtons;
