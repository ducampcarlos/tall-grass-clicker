import { describe, expect, it } from "vitest";

import { parseState, serializeState } from "../src/engine/save.js";
import { playBot } from "../src/sim/bot.js";

describe("the balance bot", () => {
  it("only ever produces states that save and load back unchanged", () => {
    for (const seed of [1, 2, 3]) {
      const { state } = playBot({ cps: 3, horizon: 1800, retireAt: 12, seed });
      const back = parseState(serializeState(state));
      expect(back, `seed ${seed}`).not.toBeNull();
      expect(back).toEqual(state);
    }
  });
});
