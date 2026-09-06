import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/admin-gate";
import { LegacyShell } from "@/components/layout/legacy-shell";

export const metadata: Metadata = {
  title: "관리자 – Type News",
  // 검색에 걸릴 이유가 없다.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <LegacyShell showTypingChrome={false} wide>
      <AdminGate />
    </LegacyShell>
  );
}
