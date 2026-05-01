import { useCallback, useEffect, useState } from "react";

import { getFreePlayTablesAvailable } from "@/lib/db_supabase/freePlayScorecardRepo";
import { supabase } from "@/lib/supabase";

export type FreePlaySchemaStatus = "pending" | "ok" | "missing";

/**
 * Probes whether Free Play tables are present. When signed out (`!userId`), reports `ok` so shells do not block.
 * When `bootstrapReady` is false, stays `pending` so we do not probe before auth/session is stable.
 */
export function useFreePlaySchemaStatus(
  userId: string | null | undefined,
  bootstrapReady: boolean,
) {
  const [status, setStatus] = useState<FreePlaySchemaStatus>(() => {
    if (!userId) return "ok";
    return "pending";
  });

  const recheck = useCallback(() => {
    if (!userId) {
      setStatus("ok");
      return;
    }
    if (!bootstrapReady) {
      setStatus("pending");
      return;
    }
    setStatus("pending");
    void getFreePlayTablesAvailable().then((ok) => setStatus(ok ? "ok" : "missing"));
  }, [userId, bootstrapReady]);

  useEffect(() => {
    recheck();
  }, [recheck]);

  useEffect(() => {
    if (!userId || !bootstrapReady) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        recheck();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [userId, bootstrapReady, recheck]);

  return { status, recheck };
}
