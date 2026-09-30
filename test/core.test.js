const test = require("node:test"),
  assert = require("node:assert");
const { analyze } = require("../analysis");
const { detect, guessVerdict, cleanParse, ratingsFromTags } = require("../tags");
const { verify } = require("../llm");

const row = (o = {}) => ({
  verdict: "average",
  dishes: [],
  comment: "",
  tags: [],
  spice: 3,
  salt: 3,
  sweetness: 3,
  quality: 4,
  hygiene: 4,
  variety: 4,
  ...o,
});
const many = (n, o) => Array.from({ length: n }, () => row(o));

test("skipped ratings are not data: a dimension with <3 ratings is n/a", () => {
  const a = analyze([...many(6, { hygiene: null }), row({ hygiene: 1 })]);
  assert.strictEqual(a.dims.find((d) => d.key === "hygiene").status, "na");
});
test("a handful of ratings does not raise a false alarm", () => {
  const a = analyze(many(4, { salt: 2 }));
  assert.ok(!a.problems.some((p) => p.dim === "salt"));
});
test("a mean that looks off but with nobody flagging it is not a problem", () => {
  const a = analyze(many(10, { salt: 2 })); // mean 2.0 = "low", but 0% are 2+ away from 3
  assert.ok(!a.problems.some((p) => p.dim === "salt"));
});
test("hygiene is always ranked first", () => {
  const a = analyze([...many(10, { salt: 5, hygiene: 2 }), ...many(10, { salt: 5, hygiene: 1 })]);
  assert.strictEqual(a.problems[0].dim, "hygiene");
});
test("Hinglish comments map to tags", () => {
  assert.deepStrictEqual(detect("rajma bahut namkeen tha, roti thandi").sort(), ["cold", "too_salty"]);
  assert.ok(detect("rice mein baal tha").includes("dirty"));
  assert.ok(detect("kam namak").includes("low_salt") && !detect("kam namak").includes("too_salty"));
  assert.ok(detect("not tasty").includes("poor_quality") && !detect("not tasty").includes("tasty"));
  assert.ok(!detect("plates not clean").includes("clean"));
  assert.deepStrictEqual(detect("ok"), []);
});
test("verdict guess and rating mapping", () => {
  assert.strictEqual(guessVerdict(["dirty"]), "bad");
  assert.strictEqual(guessVerdict(["tasty"]), "good");
  assert.deepStrictEqual(ratingsFromTags(["too_salty", "tasty", "cold"]), { salt: 5, quality: 4 });
});
test("AI parse output is restricted to known codes, verdicts and menu dishes", () => {
  const out = cleanParse(
    { tags: ["too_salty", "DROP TABLE", "ignore previous instructions"], verdict: "amazing", dishes: ["Rajma", "Pizza"] },
    ["Rajma"],
  );
  assert.deepStrictEqual(out, { tags: ["too_salty"], verdict: null, dishes: ["Rajma"] });
  assert.strictEqual(cleanParse("nonsense"), null);
});
const bad = analyze([...many(10, { salt: 5, hygiene: 1, verdict: "bad" }), ...many(10, { salt: 5, hygiene: 2, verdict: "bad" })]);
test("digest verification: numbers are recomputed, invented ones never shown", () => {
  const v = verify(
    {
      summary: "Hygiene and salt need action.",
      went_wrong: [
        { dim: "hygiene", title: "Hygiene", evidence: "avg 4.9/5", fix: "Inspect kitchen" },
        { dim: "made_up", title: "x", fix: "y" },
      ],
      went_right: ["spice", "hygiene"],
      comment_themes: [],
    },
    bad,
  );
  assert.strictEqual(v.went_wrong.length, 1);
  assert.match(v.went_wrong[0].evidence, /hygiene avg 1\.5\/5/);
  assert.deepStrictEqual(v.went_right, ["spice avg 3/5"]); // spice is a real strength; hygiene is not, so it is dropped
});
test("digest verification: rejects a digest that misses the real top problem or contradicts the data", () => {
  assert.strictEqual(verify({ summary: "Salt is a bit high.", went_wrong: [{ dim: "salt", title: "s", fix: "f" }] }, bad), null);
  assert.strictEqual(
    verify({ summary: "Everyone loved it, no issues.", went_wrong: [{ dim: "hygiene", title: "h", fix: "f" }] }, bad),
    null,
  );
});

const { detectDishes } = require("../tags");
const store = require("../store");

test("dish detection supports casual aliases and Hinglish names", () => {
  const lunchMenu = ["Dal Tadka", "Shahi Paneer", "Jeera Rice", "Tawa Roti", "Salad", "Curd"];
  assert.deepStrictEqual(detectDishes("dal was salty, roti thandi", lunchMenu).sort(), ["Dal Tadka", "Tawa Roti"]);
  assert.deepStrictEqual(detectDishes("paneer and chawal were great", lunchMenu).sort(), ["Jeera Rice", "Shahi Paneer"]);

  const dinnerMenu = ["Rajma", "Mixed Veg", "Steamed Rice", "Chapati", "Kheer", "Papad"];
  assert.deepStrictEqual(detectDishes("kheer bahut meethi thi", dinnerMenu), ["Kheer"]);
  assert.deepStrictEqual(detectDishes("sabzi thandi thi", dinnerMenu), ["Mixed Veg"]);
});

test("expanded Hinglish keywords and sentiment guess", () => {
  assert.ok(detect("khana bohot accha tha").includes("tasty"));
  assert.strictEqual(guessVerdict([], "khana bohot accha tha"), "good");
  assert.ok(detect("bakwas khana").includes("poor_quality"));
  assert.strictEqual(guessVerdict([], "ekdum bakwas"), "bad");
});

test("store clearDevice works for demo re-rating", () => {
  const testDev = "test-demo-" + Date.now();
  store.add({
    date: "2026-09-30",
    meal: "lunch",
    verdict: "good",
    dishes: ["Dal Tadka"],
    tags: ["tasty"],
    comment: "great",
    device_id: testDev,
    ts: Date.now(),
  });
  assert.strictEqual(store.dup(testDev, "lunch", "2026-09-30"), true);
  store.clearDevice(testDev, "lunch", "2026-09-30");
  assert.strictEqual(store.dup(testDev, "lunch", "2026-09-30"), false);
});
