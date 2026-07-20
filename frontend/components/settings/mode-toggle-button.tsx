"use client";

import { ArrowLeftRight } from "lucide-react";
import { useSettingsStore } from "@/stores/use-settings-store";

export function ModeToggleButton() {
  const overlayMode = useSettingsStore((s) => s.overlayMode);
  const update = useSettingsStore((s) => s.update);

  return (
    <button
      id="modeToggleBtn"
      type="button"
      className="chip-pill"
      title="오버레이-입력창 전환"
      onClick={() => update({ overlayMode: !overlayMode })}
    >
      <ArrowLeftRight size={14} />
      {overlayMode ? "오버레이" : "입력창"} 모드
    </button>
  );
}
