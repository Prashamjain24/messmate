// Scoring model: turns raw ratings into "what went wrong / what is right" for the manager.
const { TAGS, detect } = require("./tags");
const DIMS = ["spice", "salt", "sweetness", "quality", "hygiene", "variety"];
const BALANCE = ["spice", "salt", "sweetness"]; // 1=too low, 3=just right, 5=too much
const V = { good: 100, average: 50, bad: 0 };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;
function pearson(x, y) {
  const mx = avg(x),
    my = avg(y);
  let n = 0,
    dx = 0,
    dy = 0;
  x.forEach((v, i) => {
    n += (v - mx) * (y[i] - my);
    dx += (v - mx) ** 2;
    dy += (y[i] - my) ** 2;
  });
  return dx && dy ? n / Math.sqrt(dx * dy) : 0;
}
const FIX = {
  spice: ["too spicy", "too bland", "Adjust chilli quantity; keep a chilli/pickle side for those who want more."],
  salt: ["too salty", "under-salted", "Standardise salt per batch; taste-test before serving."],
  sweetness: ["too sweet", "not sweet enough", "Review sugar/jaggery quantity in the recipe."],
  quality: ["", "poor quality / freshness", "Check ingredient freshness and cooking time; inspect supplier stock."],
  hygiene: ["", "hygiene concerns", "URGENT: inspect serving area, utensils and staff hygiene today."],
  variety: ["", "low variety", "Rotate the menu; add one alternate dish or side per meal."],
};

function analyze(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const verdicts = rows.map((r) => V[r.verdict]);
  const satisfaction = Math.round(avg(verdicts));
  const dims = DIMS.map((d) => {
    const vals = rows.map((r) => r[d]).filter(Boolean),
      bal = BALANCE.includes(d),
      m = avg(vals);
    if (vals.length < 3) return { key: d, mean: null, offPct: 0, direction: null, status: "na", driver: 0 }; // skipped ratings are not data
    const off = vals.filter((x) => (bal ? Math.abs(x - 3) >= 2 : x <= 2)).length / (vals.length || 1);
    const dir = bal ? (m < 2.6 ? "low" : m > 3.4 ? "high" : "ok") : null;
    const good = bal ? Math.abs(m - 3) <= 0.4 && off < 0.2 : m >= 4 && off < 0.15;
    const enough = vals.length >= 5; // a handful of ratings is not evidence
    const bad = enough && (bal ? (dir !== "ok" && off >= 0.2) || off >= 0.3 : m < 3 || off >= 0.3);
    // driver: how strongly this dimension moves the overall verdict
    const driver = pearson(
      rows.filter((r) => r[d]).map((r) => (bal ? -Math.abs(r[d] - 3) : r[d])),
      rows.filter((r) => r[d]).map((r) => V[r.verdict]),
    );
    return {
      key: d,
      mean: r1(m),
      offPct: Math.round(off * 100),
      direction: dir,
      status: bad ? "wrong" : good ? "right" : "watch",
      driver: r1(driver),
    };
  });
  const problems = dims
    .filter((d) => d.status === "wrong")
    .map((d) => {
      const f = FIX[d.key],
        label = d.direction === "high" ? f[0] : d.direction === "low" && BALANCE.includes(d.key) ? f[1] : f[1] || f[0];
      const sev =
        d.key === "hygiene"
          ? "high"
          : d.offPct >= 40 || (BALANCE.includes(d.key) && Math.abs(d.mean - 3) >= 1.2)
            ? "high"
            : "medium";
      return {
        dim: d.key,
        issue: label,
        severity: sev,
        offPct: d.offPct,
        mean: d.mean,
        fix: f[2],
        score: (sev === "high" ? 100 : 50) + d.offPct + (d.key === "hygiene" ? 1000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
  const strengths = dims.filter((d) => d.status === "right").map((d) => ({ dim: d.key, mean: d.mean }));
  const dishMap = {};
  rows.forEach((r) => (r.dishes || []).forEach((x) => (dishMap[x] ||= []).push(V[r.verdict])));
  const dishes = Object.entries(dishMap)
    .filter(([, v]) => v.length >= 3)
    .map(([name, v]) => ({ name, n: v.length, satisfaction: Math.round(avg(v)) }))
    .sort((a, b) => a.satisfaction - b.satisfaction);
  const counts = {};
  rows.forEach((r) => new Set([...(r.tags || []), ...detect(r.comment)]).forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const themes = Object.entries(counts)
    .map(([c, count]) => ({ theme: TAGS[c].label, count }))
    .sort((a, b) => b.count - a.count);
  const verdicts3 = { good: 0, average: 0, bad: 0 };
  rows.forEach((r) => verdicts3[r.verdict]++);
  const drivers = [...dims]
    .sort((a, b) => b.driver - a.driver)
    .slice(0, 2)
    .map((d) => d.key);
  const headline = problems.length
    ? `Fix first: ${problems[0].issue} (${problems[0].dim}). ${strengths.length ? "Working well: " + strengths.map((s) => s.dim).join(", ") + "." : ""}`
    : "No major problems today. Keep it up.";
  return {
    n,
    satisfaction,
    verdicts: verdicts3,
    confidence: n < 5 ? "insufficient" : n < 15 ? "low" : "high",
    dims,
    problems,
    strengths,
    dishes,
    themes,
    drivers,
    headline,
  };
}
module.exports = { analyze, DIMS, BALANCE };
