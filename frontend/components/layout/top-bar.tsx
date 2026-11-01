"use client";

import { Quote } from "lucide-react";
import { useRef, useState } from "react";
import { LongformPicker } from "@/components/longform/longform-picker";
import { TypingRecorder } from "@/components/recording/typing-recorder";
import { ScripturePanel } from "@/components/scripture/scripture-panel";
import { ScriptureSongPicker } from "@/components/scripture/scripture-song-picker";
import { ModeControls } from "@/components/typing/mode-controls";
import type { ScriptureKind } from "@/features/scripture/scripture-library";
import type { Language } from "@/lib/types";
import { useUiLanguage } from "@/lib/ui-language";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";
import styles from "./top-bar.module.css";

export function TopBar() {
  const { t } = useUiLanguage();
  const settings = useSettingsStore();
  const language = useTypingStore((state) => state.language);
  const mode = useTypingStore((state) => state.mode);
  const scriptureId = useTypingStore((state) => state.scriptureId);
  const isScripture = scriptureId !== null;
  const isLongform = scriptureId?.startsWith("longform:") ?? false;
  /* 어떤 종류의 보관함을 열었는지. 닫아도 남겨서 다시 열면 같은 곳이 보인다. */
  const [scripturePanel, setScripturePanel] = useState<{ open: boolean; kind: ScriptureKind }>({
    open: false,
    kind: "short",
  });
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [longformLanguage, setLongformLanguage] = useState<Language | null>(null);
  const recordingTargetRef = useRef<HTMLElement | null>(null);

  /* 사용자가 넣은 필사는 언어를 확정할 수 없지만, 기본 긴 글은 언어가 명확하다.
     따라서 긴 글에서는 일반 문장처럼 무시 옵션을 허용한다. */
  const canUseIgnore = !isScripture || isLongform;
  const ignoreDisabledReason = !canUseIgnore ? t("필사 중에는 사용할 수 없습니다", "Unavailable while practicing your own text") : null;

  const streamingEnabled =
    !isScripture && language === "kor" && (mode === "short" || mode === "long");
  // 영어 문장에서 영어를 무시하면 칠 글자가 하나도 남지 않는다.
  const canIgnoreEnglish = canUseIgnore && language === "kor";

  return (
    <>
      {/* 무엇을 칠지 고르는 버튼들 */}
      <div className="dock-group dock-group-mode">
        <ModeControls
          onOpenScripture={(kind) => setScripturePanel({ open: true, kind })}
          onOpenSongPicker={() => setSongPickerOpen(true)}
          onOpenLongform={setLongformLanguage}
        />
      </div>
      <LongformPicker
        open={longformLanguage !== null}
        language={longformLanguage ?? language}
        onClose={() => setLongformLanguage(null)}
      />
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
          data-selected={canUseIgnore && settings.ignorePunctuation}
          disabled={!canUseIgnore}
          title={ignoreDisabledReason ?? t("문장부호 무시", "Ignore punctuation")}
          onClick={() => settings.update({ ignorePunctuation: !settings.ignorePunctuation })}
        >
          <Quote size={14} />
        </button>
        <button
          type="button"
          className="chip-pill"
          data-selected={canUseIgnore && settings.ignoreNumbers}
          disabled={!canUseIgnore}
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
          data-selected={canUseIgnore && settings.ignoreSymbols}
          disabled={!canUseIgnore}
          title={ignoreDisabledReason ?? t("특수문자 무시", "Ignore symbols")}
          onClick={() => settings.update({ ignoreSymbols: !settings.ignoreSymbols })}
        >
          !~@
        </button>
      </div>
      <div className={styles.recordingGroup} data-recording-group="true">
        <TypingRecorder targetRef={recordingTargetRef} />
      </div>
    </>
  );
}
