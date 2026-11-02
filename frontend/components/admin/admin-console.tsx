"use client";

import { ChartNoAxesCombined, FileText, Gift, Image, Inbox, Lock, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { AnalyticsTab } from "@/components/admin/analytics-tab";
import { ProfilePhotosTab } from "@/components/admin/profile-photos-tab";
import { PrizesTab } from "@/components/admin/prizes-tab";
import { SentenceRequestsTab } from "@/components/admin/sentence-requests-tab";
import { SentencesTab } from "@/components/admin/sentences-tab";
import { UsersTab } from "@/components/admin/users-tab";
import { WinnersTab } from "@/components/admin/winners-tab";

const TABS = [
  { id: "requests", label: "문장 요청", icon: Inbox },
  { id: "sentences", label: "문장 관리", icon: FileText },
  { id: "users", label: "사용자", icon: Users },
  { id: "photos", label: "프로필 사진", icon: Image },
  { id: "analytics", label: "이용 분석", icon: ChartNoAxesCombined },
  { id: "prizes", label: "경품", icon: Gift },
  { id: "winners", label: "당첨 관리", icon: Trophy },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminConsole({ onLock }: { onLock: () => void }) {
  const [tab, setTab] = useState<TabId>("requests");

  return (
    <div className="admin-console">
      <header className="admin-head">
        <div>
          <p>TypeNews Operations</p>
          <h1>관리자 콘솔</h1>
        </div>
        <button type="button" className="admin-control-button" onClick={onLock} title="다시 잠그기">
          <Lock size={14} />
          잠그기
        </button>
      </header>

      <nav className="admin-tabs" aria-label="관리 항목">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="admin-tab-button"
            data-selected={tab === item.id}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* 탭을 벗어나면 상태를 버린다. 다시 들어오면 새로 읽는 편이
          편집 도중 다른 탭에서 바꾼 값과 어긋나지 않는다. */}
      {tab === "requests" ? <SentenceRequestsTab /> : null}
      {tab === "sentences" ? <SentencesTab /> : null}
      {tab === "users" ? <UsersTab /> : null}
      {tab === "photos" ? <ProfilePhotosTab /> : null}
      {tab === "analytics" ? <AnalyticsTab /> : null}
      {tab === "prizes" ? <PrizesTab /> : null}
      {tab === "winners" ? <WinnersTab /> : null}
    </div>
  );
}
