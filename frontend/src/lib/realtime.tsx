import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { startStream, stopStream } from "@/lib/sse";

export function useRealtime() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  useEffect(() => {
    if (!user) {
      stopStream();
      return;
    }
    startStream((evt) => {
      switch (evt.type) {
        case "contact.created":
        case "contact.updated":
        case "contact.deleted":
          qc.invalidateQueries({ queryKey: ["contacts"] });
          qc.invalidateQueries({ queryKey: ["contact"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
          break;
        case "task.created":
        case "task.updated":
        case "task.deleted":
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
          break;
        case "followup.created":
        case "followup.sent":
        case "followup.deleted":
          qc.invalidateQueries({ queryKey: ["followups"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
          break;
      }
    });
    return () => stopStream();
  }, [user, qc]);
}
