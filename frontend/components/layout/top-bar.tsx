"use client";

import { Quote } from "lucide-react";
import { useState } from "react";
import { ScripturePanel } from "@/components/scripture/scripture-panel";
import { ScriptureSongPicker } from "@/components/scripture/scripture-song-picker";
import { ModeControls } from "@/components/typing/mode-controls";
import type { ScriptureKind } from "@/features/scripture/scripture-library";
import { useUiLanguage } from "@/lib/ui-language";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";

export function TopBar() {
  const { t } = useUiLanguage();
  const settings = useSettingsStore();
  const language = useTypingStore((state) => state.language);
  const mode = useTypingStore((state) => state.mode);
  const scriptureId = useTypingStore((state) => state.scriptureId);
  const isScripture = scriptureId !== null;
  /* 어떤 종류의 보관함을 열었는지. 닫아도 남겨서 다시 열면 같은 곳이 보인다. */
  const [scripturePanel, setScripturePanel] = useState<{ open: boolean; kind: ScriptureKind }>({
    open: false,
    kind: "short",
  });
  const [songPickerOpen, setSongPickerOpen] = useState(false);

  /* 필사는 원문을 그대로 옮겨 적는 연습이다. 글자를 빼고 치면 필사가 아니고,
     사용자가 넣은 글이라 언어를 알 수 없어서 "영어를 무시하면 칠 글자가 남지
     않는" 문제도 여기서만 막을 수 없다. 그래서 무시 옵션을 통째로 잠근다.
     워크스페이스도 필사 중에는 무시 설정을 무력화한다(effectiveSettings). */
  const ignoreDisabledReason = isScripture ? t("필사 중에는 사용할 수 없습니다", "Unavailable while practicing your own text") : null;

  const streamingEnabled =
    !isScripture && language === "kor" && (mode === "short" || mode === "long");
  // 영어 문장에서 영어를 무시하면 칠 글자가 하나도 남지 않는다.
  const canIgnoreEnglish = !isScripture && language === "kor";

  return (
    <>
      {/* 무엇을 칠지 고르는 버튼들 */}
      <div className="dock-group dock-group-mode">
        <ModeControls
          onOpenScripture={(kind) => setScripturePanel({ open: true, kind })}
          onOpenSongPicker={() => setSongPickerOpen(true)}
        />
      </div>
      <ScripturePanel
        open={scripturePanel.open}
        kind={scripturePanel.kind}
        onKindChange={(kind) => setScripturePanel((current) => ({ ...current, kind }))}
        onClose={() => setScripturePanel((current) => ({ ...current, open: false }))}
      />
      <ScriptureSongPicker
        open={songPickerOpen}
        onClose={() => setSongPickerOpen(false)}
        onManage={() => {
          setSongPickerOpen(false);
          setScripturePanel({ open: true, kind: "song" });
        }}
      />

      {/* 어떻게 칠지 고르는 버튼들. 성격이 달라 따로 묶고 폭도 맞춘다. */}
      <div className="dock-group dock-group-filter">
        <button
          type="button"
          className="chip-pill"
          data-selected={streamingEnabled && settings.ignoreStreaming}
          disabled={!streamingEnabled}
          title={ignoreDisabledReason ?? t("스트림 문장 전환", "Streaming prompt set")}
          onClick={() => settings.update({ ignoreStreaming: !settings.ignoreStreaming })}
        >
          M
        </button>
        <button
          type="button"
          className="chip-pill"
          data-selected={!isScripture && settings.ignorePunctuation}
          disabled={isScripture}
          title={ignoreDisabledReason ?? t("문장부호 무시", "Ignore punctuation")}
          onClick={() => settings.update({ ignorePunctuation: !settings.ignorePunctuation })}
        >
          <Quote size={14} />
        </button>
        <button
          type="button"
          className="chip-pill"
          data-selected={!isScripture && settings.ignoreNumbers}
          disabled={isScripture}
          title={ignoreDisabledReason ?? t("숫자 무시", "Ignore numbers")}
          onClick={() => settings.update({ ignoreNumbers: !settings.ignoreNumbers })}
        >
          123
        </button>
        <button
          type="button"
          className="chip-pill"
          data-selected={canIgnoreEnglish && settings.ignoreEnglish}
          disabled={!canIgnoreEnglish}
          title={ignoreDisabledReason ?? (canIgnoreEnglish ? t("영어 무시", "Ignore English") : t("영어 모드에서는 사용할 수 없습니다", "Unavailable in English mode"))}
          onClick={() => settings.update({ ignoreEnglish: !settings.ignoreEnglish })}
        >
          ABC
        </button>
        <button
          type="button"
          className="chip-pill"
          data-selected={!isScripture && settings.ignoreSymbols}
          disabled={isScripture}
          title={ignoreDisabledReason ?? t("특수문자 무시", "Ignore symbols")}
          onClick={() => settings.update({ ignoreSymbols: !settings.ignoreSymbols })}
        >
          !~@
        </button>
      </div>
    </>
  );
}
