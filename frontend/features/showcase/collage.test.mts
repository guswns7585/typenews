import assert from "node:assert/strict";
import { showcaseCollageLayout } from "./collage";

for (const count of [1, 2, 3, 4, 5, 7, 10, 99]) {
  const layout = showcaseCollageLayout(count);
  assert.equal(layout.length, Math.min(10, count));
  layout.forEach((card) => {
    assert.ok(card.width > 200 && card.height > 200);
    assert.ok(card.x > -80 && card.y > 180);
    assert.ok(card.x + card.width < 1480 && card.y + card.height < 1350);
    assert.ok(Math.abs(card.rotation) <= 4);
  });
}
console.log("showcase collage layout checks passed");
