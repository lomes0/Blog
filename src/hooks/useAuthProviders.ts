"use client";

import { useEffect, useState } from "react";
import { getProviders } from "next-auth/react";

/** A sign-in provider this deployment actually has configured. */
export interface AuthProvider {
  id: string;
  name: string;
}

/**
 * The providers NextAuth is serving, read from `/api/auth/providers`.
 *
 * The login UI used to name a provider itself — `signIn("google")` — while
 * `authOptions` registered only GitHub, so the buttons pointed at a provider
 * that did not exist and could never complete a sign-in. Asking the server what
 * it supports keeps the two from drifting: add or remove credentials and the
 * buttons follow.
 *
 * `loading` is distinct from "none configured" so callers can avoid flashing a
 * "sign-in unavailable" state before the fetch resolves.
 */
export function useAuthProviders() {
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((result) => {
        if (cancelled) return;
        setProviders(
          Object.values(result ?? {}).map(({ id, name }) => ({ id, name })),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Could not load sign-in providers", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loading };
}
