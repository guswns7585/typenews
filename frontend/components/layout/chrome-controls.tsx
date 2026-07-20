"use client";

import { BackgroundPicker } from "@/components/settings/background-picker";
import { FontSizeSlider } from "@/components/settings/font-size-slider";
import { ModeToggleButton } from "@/components/settings/mode-toggle-button";

export function ChromeControls() {
  return (
    <>
      <BackgroundPicker />
      <ModeToggleButton />
      <FontSizeSlider />
    </>
  );
}
