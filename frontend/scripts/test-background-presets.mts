import assert from "node:assert/strict";
import { useUiStore } from "../stores/use-ui-store";

useUiStore.setState({
  background: "custom-solid",
  solidColor: "#112233",
  customTextColor: "#fefefe",
  customButtonBg: "#445566",
  gradientColors: ["#111111", "#222222", "#333333"],
  gradientTextColor: "#eeeeee",
  gradientButtonBg: "#777777",
  customBackgroundPresets: [],
});

useUiStore.getState().saveCustomPreset("  단색 밤  ");
let presets = useUiStore.getState().customBackgroundPresets;
assert.equal(presets.length, 1);
assert.equal(presets[0].name, "단색 밤");
assert.equal(presets[0].kind, "solid");
assert.deepEqual(presets[0].colors, ["#112233", "#112233", "#112233"]);

const presetId = presets[0].id;
useUiStore.getState().renameCustomPreset(presetId, "밤하늘");
assert.equal(useUiStore.getState().customBackgroundPresets[0].name, "밤하늘");

useUiStore.setState({
  background: "custom-gradient",
  gradientColors: ["#aa0000", "#00aa00", "#0000aa"],
  gradientTextColor: "#fafafa",
  gradientButtonBg: "#101010",
});
useUiStore.getState().overwriteCustomPreset(presetId);
presets = useUiStore.getState().customBackgroundPresets;
assert.equal(presets[0].kind, "gradient");
assert.deepEqual(presets[0].colors, ["#aa0000", "#00aa00", "#0000aa"]);

useUiStore.setState({ background: "default" });
useUiStore.getState().applyCustomPreset(presetId);
assert.equal(useUiStore.getState().background, "custom-gradient");
assert.deepEqual(useUiStore.getState().gradientColors, ["#aa0000", "#00aa00", "#0000aa"]);

useUiStore.getState().deleteCustomPreset(presetId);
assert.equal(useUiStore.getState().customBackgroundPresets.length, 0);

console.log("background preset tests passed");
