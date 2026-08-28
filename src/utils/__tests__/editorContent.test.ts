import { readingMinutes, WORDS_PER_MIN } from "../editorContent";

/**
 * The read-time derivation, which until now was written out twice — once
 * dividing by a named `WORDS_PER_MIN` in the right rail's Outline, once by a
 * literal `200` in its Properties. Two copies of one line agreed by luck; this
 * pins the behaviour they agreed on so the third caller (the workspace status
 * bar) cannot quietly become a fourth spelling.
 *
 * `countWords` is left to its own devices here: it walks a Lexical tree and its
 * behaviour is exercised through every surface that renders a word count. What
 * is worth pinning is the boundary the status bar depends on — that an empty
 * document reads as zero minutes rather than one.
 */
describe("readingMinutes", () => {
  it("is zero for a document with no words", () => {
    // The one behavioural change made when the two copies were merged. Both
    // prior call sites render only when `countWords(...) > 0`, so a floor of 1
    // was unreachable there; the status bar has no such guard and needs "no
    // content yet" to be distinguishable from "a one-minute read".
    expect(readingMinutes(0)).toBe(0);
  });

  it("floors at one minute for anything shorter than the rate", () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(WORDS_PER_MIN - 1)).toBe(1);
    expect(readingMinutes(WORDS_PER_MIN)).toBe(1);
  });

  it("rounds up — a part-minute of reading is still a minute of reading", () => {
    expect(readingMinutes(WORDS_PER_MIN + 1)).toBe(2);
    expect(readingMinutes(WORDS_PER_MIN * 3 - 1)).toBe(3);
  });

  it("scales linearly with the rate", () => {
    expect(readingMinutes(WORDS_PER_MIN * 2)).toBe(2);
    expect(readingMinutes(WORDS_PER_MIN * 10)).toBe(10);
  });
});
