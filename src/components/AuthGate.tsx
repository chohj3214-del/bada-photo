import { type PropsWithChildren, useEffect, useState } from "react";
import { ensureAnonymousSession } from "../services/supabaseClient";

export function AuthGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void ensureAnonymousSession()
      .then(() => setReady(true))
      .catch(() => setError("연결을 준비하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요."));
  }, []);

  if (error) return <main className="auth-page"><p>{error}</p><button className="primary" onClick={() => window.location.reload()}>다시 시도</button></main>;
  if (!ready) return <main className="auth-page"><p>바다사진을 준비하고 있어요…</p></main>;
  return <>{children}</>;
}
