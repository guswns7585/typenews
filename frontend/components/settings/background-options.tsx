"use client";

import { Check, Pencil, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useUiLanguage } from "@/lib/ui-language";
import { useUiStore, type BackgroundTheme } from "@/stores/use-ui-store";

const themes: { id: BackgroundTheme; label: string; labelEn: string }[] = [
  { id: "default", label: "기본", labelEn: "Default" },
  { id: "sky", label: "맑은 하늘", labelEn: "Clear Sky" },
  { id: "insta", label: "인스타그램", labelEn: "Instagram" },
  { id: "sunset", label: "석양", labelEn: "Sunset" },
  { id: "forest", label: "숲", labelEn: "Forest" },
  { id: "oceon", label: "바다", labelEn: "Ocean" },
  { id: "twilight", label: "황혼", labelEn: "Twilight" },
  { id: "lagoon", label: "노을바다", labelEn: "Lagoon" },
];

/** 설정 패널 안에 펼쳐두는 배경 선택기. 자체 토글 없이 목록만 보여준다. */
export function BackgroundOptions() {
  const { isEnglish, t } = useUiLanguage();
  const [presetName, setPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const background = useUiStore((s) => s.background);
  const solidColor = useUiStore((s) => s.solidColor);
  const gradientColors = useUiStore((s) => s.gradientColors);
  const customTextColor = useUiStore((s) => s.customTextColor);
  const customButtonBg = useUiStore((s) => s.customButtonBg);
  const gradientTextColor = useUiStore((s) => s.gradientTextColor);
  const gradientButtonBg = useUiStore((s) => s.gradientButtonBg);
  const customBackgroundPresets = useUiStore((s) => s.customBackgroundPresets);
  const setBackground = useUiStore((s) => s.setBackground);
  const setSolidColor = useUiStore((s) => s.setSolidColor);
  const setGradientColors = useUiStore((s) => s.setGradientColors);
  const setCustomTextColor = useUiStore((s) => s.setCustomTextColor);
  const setCustomButtonBg = useUiStore((s) => s.setCustomButtonBg);
  const setGradientTextColor = useUiStore((s) => s.setGradientTextColor);
  const setGradientButtonBg = useUiStore((s) => s.setGradientButtonBg);
  const saveCustomPreset = useUiStore((s) => s.saveCustomPreset);
  const renameCustomPreset = useUiStore((s) => s.renameCustomPreset);
  const overwriteCustomPreset = useUiStore((s) => s.overwriteCustomPreset);
  const applyCustomPreset = useUiStore((s) => s.applyCustomPreset);
  const deleteCustomPreset = useUiStore((s) => s.deleteCustomPreset);
  const isCustomBackground = background === "custom-solid" || background === "custom-gradient";

  function addPreset() {
    if (!presetName.trim() || !isCustomBackground) return;
    saveCustomPreset(presetName);
    setPresetName("");
  }

  function commitRename() {
    if (!editingId || !editingName.trim()) return;
    renameCustomPreset(editingId, editingName);
    setEditingId(null);
    setEditingName("");
  }

  return (
    <div className="settings-bg">
      <div className="settings-bg-grid">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className="chip-pill"
            data-selected={background === theme.id}
            onClick={() => setBackground(theme.id)}
          >
            {isEnglish ? theme.labelEn : theme.label}
          </button>
        ))}
      </div>

      {/* 단색: 배경 · 글자 · 버튼 (원본과 같은 3개) */}
      <div className="settings-bg-custom">
        <button
          type="button"
          className="chip-pill"
          data-selected={background === "custom-solid"}
          onClick={() => setBackground("custom-solid")}
        >
          {t("단색", "Solid")}
        </button>
        <input
          type="color"
          title={t("배경 색상", "Background color")}
          aria-label={t("단색 배경 색상", "Solid background color")}
          value={solidColor}
          onChange={(event) => {
            setSolidColor(event.target.value);
            setBackground("custom-solid");
          }}
        />
        <input
          type="color"
          title={t("글자 색상", "Text color")}
          aria-label={t("단색 배경의 글자 색상", "Text color on solid background")}
          value={customTextColor}
          onChange={(event) => {
            setCustomTextColor(event.target.value);
            setBackground("custom-solid");
          }}
        />
        <input
          type="color"
          title={t("버튼 색상", "Button color")}
          aria-label={t("단색 배경의 버튼 색상", "Button color on solid background")}
          value={customButtonBg}
          onChange={(event) => {
            setCustomButtonBg(event.target.value);
            setBackground("custom-solid");
          }}
        />
      </div>

      {/* 그라데이션: 배경 3색 · 글자 · 버튼 (원본과 같은 5개) */}
      <div className="settings-bg-custom">
        <button
          type="button"
          className="chip-pill"
          data-selected={background === "custom-gradient"}
          onClick={() => setBackground("custom-gradient")}
        >
          {t("그라데이션", "Gradient")}
        </button>
        {gradientColors.map((color, index) => (
          <input
            key={index}
            type="color"
            title={`${t("배경 색상", "Background color")} ${index + 1}`}
            aria-label={`${t("그라데이션 색상", "Gradient color")} ${index + 1}`}
            value={color}
            onChange={(event) => {
              const next = [...gradientColors] as [string, string, string];
              next[index] = event.target.value;
              setGradientColors(next);
              setBackground("custom-gradient");
            }}
          />
        ))}
        <input
          type="color"
          title={t("글자 색상", "Text color")}
          aria-label={t("그라데이션 배경의 글자 색상", "Text color on gradient background")}
          value={gradientTextColor}
          onChange={(event) => {
            setGradientTextColor(event.target.value);
            setBackground("custom-gradient");
          }}
        />
        <input
          type="color"
          title={t("버튼 색상", "Button color")}
          aria-label={t("그라데이션 배경의 버튼 색상", "Button color on gradient background")}
          value={gradientButtonBg}
          onChange={(event) => {
            setGradientButtonBg(event.target.value);
            setBackground("custom-gradient");
          }}
        />
      </div>

      <p className="settings-hint">{t("배경 · 글자 · 버튼 순서입니다. 로고 색도 함께 바뀝니다.", "Colors are ordered as background, text, and buttons. The logo changes with them.")}</p>

      <div className="background-presets">
        <div className="background-preset-head">
          <strong>{t("프리셋", "Presets")}</strong>
          <span>{customBackgroundPresets.length} / 12</span>
        </div>

        <div className="background-preset-create">
          <input
            className="settings-input"
            value={presetName}
            maxLength={20}
            placeholder={t("프리셋 이름", "Preset name")}
            aria-label={t("새 배경 프리셋 이름", "New background preset name")}
            onChange={(event) => setPresetName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPreset();
              }
            }}
          />
          <button
            type="button"
            className="preset-save-btn"
            disabled={
              !presetName.trim() || !isCustomBackground || customBackgroundPresets.length >= 12
            }
            onClick={addPreset}
          >
            <Save size={14} />
            {t("저장", "Save")}
          </button>
        </div>

        {customBackgroundPresets.length ? (
          <div className="background-preset-list">
            {customBackgroundPresets.map((preset) => (
              <div className="background-preset-row" key={preset.id}>
                {editingId === preset.id ? (
                  <div className="background-preset-edit">
                    <input
                      className="settings-input"
                      value={editingName}
                      maxLength={20}
                      aria-label={`${preset.name} ${t("프리셋 이름", "preset name")}`}
                      autoFocus
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      type="button"
                      className="preset-icon-btn"
                      title={t("이름 저장", "Save name")}
                      aria-label={`${preset.name} ${t("이름 저장", "save name")}`}
                      disabled={!editingName.trim()}
                      onClick={commitRename}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn"
                      title={t("취소", "Cancel")}
                      aria-label={`${preset.name} ${t("이름 변경 취소", "cancel rename")}`}
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="background-preset-apply"
                    onClick={() => applyCustomPreset(preset.id)}
                  >
                    <span className="preset-swatches" aria-hidden="true">
                      {(preset.kind === "solid" ? [preset.colors[0]] : preset.colors).map(
                        (color, index) => (
                          <span key={`${preset.id}-${index}`} style={{ backgroundColor: color }} />
                        ),
                      )}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                )}

                {editingId !== preset.id ? (
                  <div className="background-preset-actions">
                    <button
                      type="button"
                      className="preset-icon-btn"
                      title={t("이름 변경", "Rename")}
                      aria-label={`${preset.name} ${t("이름 변경", "rename")}`}
                      onClick={() => {
                        setEditingId(preset.id);
                        setEditingName(preset.name);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn"
                      title={t("현재 색으로 덮어쓰기", "Overwrite with current colors")}
                      aria-label={`${preset.name} ${t("현재 색으로 덮어쓰기", "overwrite with current colors")}`}
                      disabled={!isCustomBackground}
                      onClick={() => overwriteCustomPreset(preset.id)}
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn is-danger"
                      title={t("삭제", "Delete")}
                      aria-label={`${preset.name} ${t("프리셋 삭제", "delete preset")}`}
                      onClick={() => deleteCustomPreset(preset.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
