"use client";

import { useSettingsStore } from "@/stores/use-settings-store";

export function FontSizeSlider() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const update = useSettingsStore((s) => s.update);

  return (
    <label className="chip-pill" title={`현재 폰트: ${fontSize}px`} style={{ gap: 8 }}>
      <span aria-hidden="true">Aa</span>
      <input
        type="range"
        id="fontSizeSlider"
        min={18}
        max={42}
        value={fontSize}
        onChange={(event) => {
          const next = Number(event.target.value);
          update({ fontSize: next });
          document.documentElement.style.setProperty("--font-size-body", `${next}px`);
        }}
        style={{ accentColor: "var(--color-primary)", width: 90 }}
      />
    </label>
  );
}
