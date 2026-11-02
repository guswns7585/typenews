import assert from "node:assert/strict";
import { parseKeyxifJson } from "./keyxif";

const [preset] = parseKeyxifJson(JSON.stringify({
  format: "keyxif-web-backup",
  version: 1,
  buildPresets: [{ presetName: "Frog build", buildInfo: { housing: "Frog TKL", switchName: "MX Black", plate: "Aluminum", mount: "Top", keycap: "GMK WoB", nickname: "tester", customLogoUri: "data:image/png;base64,secret" } }],
}));
assert.equal(preset.name, "Frog build");
assert.deepEqual(preset.build, { case: "Frog TKL", switches: "MX Black", plate: "Aluminum", mounting: "Top", keycaps: "GMK WoB" });
assert.equal("customLogoUri" in preset.snapshot, false);
assert.throws(() => parseKeyxifJson("not-json"), /올바른/);
assert.throws(() => parseKeyxifJson(JSON.stringify({ buildPresets: [] })), /찾지 못했습니다/);
console.log("KeyXIF archive import checks passed");
