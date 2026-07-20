"use client";

import { Quote } from "lucide-react";
import { ModeControls } from "@/components/typing/mode-controls";
import { useSettingsStore } from "@/stores/use-settings-store";

export function TopBar() {
  const settings = useSettingsStore();

  return (
    <>
      <ModeControls />
      <button
        type="button"
        className="chip-pill"
        data-selected={settings.ignoreStreaming}
        title="밈 문장 제외"
        onClick={() => settings.update({ ignoreStreaming: !settings.ignoreStreaming })}
      >
        M
      </button>
      <button
        type="button"
        className="chip-pill"
        data-selected={settings.ignorePunctuation}
        title="문장부호 무시"
        onClick={() => settings.update({ ignorePunctuation: !settings.ignorePunctuation })}
      >
        <Quote size={14} />
      </button>
      <button
        type="button"
        className="chip-pill"
        data-selected={settings.ignoreNumbers}
        title="숫자 무시"
        onClick={() => settings.update({ ignoreNumbers: !settings.ignoreNumbers })}
      >
        123
      </button>
      <button
        type="button"
        className="chip-pill"
        data-selected={settings.ignoreEnglish}
        title="영어 무시"
        onClick={() => settings.update({ ignoreEnglish: !settings.ignoreEnglish })}
      >
        ABC
      </button>
      <button
        type="button"
        className="chip-pill"
        data-selected={settings.ignoreSymbols}
        title="특수문자 무시"
        onClick={() => settings.update({ ignoreSymbols: !settings.ignoreSymbols })}
      >
        !~@
      </button>
    </>
  );
}
