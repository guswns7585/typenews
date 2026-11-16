"use client";

import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminConsole } from "@/components/admin/admin-console";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";

/** 기억하기를 끈 경우 같은 탭에서 새로 고칠 때만 유지한다. */
const UNLOCK_KEY = "typenews:admin-unlocked";

type Access = "checking" | "anonymous" | "denied" | "granted" | "unconfigured";

/**
 * /admin의 문지기.
 *
 * 두 겹으로 막는다.
 *   1) is_admin() — 서버가 판정한다. 이게 실제 권한이다.
 *   2) 비밀번호 — 오조작 방지용 잠금. 관리자가 실수로 편집 화면을 열어두는 것을 막는다.
 *
 * 2번은 보안이 아니다. sessionStorage를 손으로 고쳐 화면을 열 수는 있지만,
 * 그렇게 들어가도 RLS가 막아서 아무 행도 읽거나 고칠 수 없다.
 * 그래서 비밀번호는 서버에서만 비교하고(/api/admin/unlock) 값은 번들에 넣지 않는다.
 */
export function AdminGate() {
  const [access, setAccess] = useState<Access>(hasSupabaseConfig() ? "checking" : "unconfigured");
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;

    async function check(token?: string) {
      if (!token) {
        if (active) {
          setAccess("anonymous");
          setUnlocked(false);
          sessionStorage.removeItem(UNLOCK_KEY);
        }
        return;
      }
      const { data, error: rpcError } = await supabase!.rpc("is_admin");
      if (!active) return;
      if (rpcError) {
        console.error("관리자 확인 실패", rpcError);
        setAccess("denied");
        return;
      }
      if (data !== true) {
        setAccess("denied");
        setUnlocked(false);
        return;
      }
      setAccess("granted");
      // 탭 잠금이 풀렸거나 서버가 서명한 기기 쿠키가 있으면 비밀번호를 건너뛴다.
      if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
        setUnlocked(true);
        return;
      }
      const response = await fetch("/api/admin/unlock", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (active) setUnlocked(response?.ok === true);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void check(data.session?.access_token);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.access_token);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase 환경변수가 없습니다");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("로그인이 만료되었습니다. 새로고침 후 다시 로그인해주세요");
        return;
      }

      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password, rememberDevice }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorTextOf(payload, "잠금을 해제하지 못했습니다"));
        return;
      }
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setPassword("");
      setUnlocked(true);
    } catch (cause) {
      console.error("관리자 잠금 해제 실패", cause);
      setError("서버에 연결하지 못했습니다");
    } finally {
      setBusy(false);
    }
  }

  if (access === "unconfigured") {
    return <AdminNotice title="설정이 필요합니다" body="Supabase 환경변수가 없습니다." />;
  }
  if (access === "checking") {
    return <AdminNotice title="확인 중" body="권한을 확인하고 있습니다." />;
  }
  if (access === "anonymous") {
    return <AdminNotice title="로그인이 필요합니다" body="헤더에서 Google 로그인을 먼저 해주세요." />;
  }
  if (access === "denied") {
    return <AdminNotice title="권한이 없습니다" body="관리자 계정으로 로그인해야 볼 수 있습니다." />;
  }

  if (!unlocked) {
    return (
      <div className="admin-lock">
        <Lock size={20} aria-hidden="true" />
        <h1>관리자 확인</h1>
        <p>실수로 편집 화면을 열지 않도록 비밀번호를 한 번 더 확인합니다.</p>
        <form
          className="admin-lock-form"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <input
            type="password"
            className="settings-input"
            value={password}
            autoComplete="current-password"
            placeholder="비밀번호"
            aria-label="관리자 비밀번호"
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="chip-pill" disabled={busy || !password}>
            들어가기
          </button>
        </form>
        <label className="admin-lock-remember">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          이 브라우저에서 30일간 기억
        </label>
        {error ? <p className="settings-status is-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <AdminConsole
      onLock={() => {
        sessionStorage.removeItem(UNLOCK_KEY);
        setUnlocked(false);
        void fetch("/api/admin/unlock", { method: "DELETE" });
      }}
    />
  );
}

/** /api/admin/unlock은 실패를 { error } 로 돌려준다. */
function errorTextOf(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error: unknown }).error;
    if (typeof value === "string" && value) return value;
  }
  return fallback;
}

function AdminNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="admin-lock">
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}
