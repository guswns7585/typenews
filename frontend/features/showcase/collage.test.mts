import assert from "node:assert/strict";
import { showcaseCollageGrid } from "./collage";

assert.deepEqual(showcaseCollageGrid(1), { columns: 1, rows: 1 });
assert.deepEqual(showcaseCollageGrid(4), { columns: 2, rows: 2 });
assert.deepEqual(showcaseCollageGrid(7), { columns: 3, rows: 3 });
assert.deepEqual(showcaseCollageGrid(10), { columns: 4, rows: 3 });
assert.deepEqual(showcaseCollageGrid(99), { columns: 4, rows: 3 });
console.log("showcase collage layout checks passed");
