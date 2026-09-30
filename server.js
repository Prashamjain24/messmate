// MessMate backend: REST API + static hosting. Storage in store.js, scoring in analysis.js, LLM in llm.js.
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");

// Automatically load .env if present
try {
  if (process.loadEnvFile) {
    process.loadEnvFile();
  } else {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m && !m[1].startsWith("#") && process.env[m[1]] === undefined) {
          process.env[m[1]] = (m[2] || "").trim().replace(/^['"]|['"]$/g, "");
        }
      }
    }
  }
} catch (e) {
  // Ignore if .env doesn't exist or already loaded
}

const { analyze, DIMS } = require("./analysis"),
  store = require("./store"),
  llm = require("./llm");
const { TAGS, detect, guessVerdict, detectDishes, cleanParse, ratingsFromTags } = require("./tags");
const PORT = process.env.PORT || 3000,
  PIN = process.env.MANAGER_PIN || "1234";
const TZ = process.env.MESS_TZ || "Asia/Kolkata",
  REQUIRE_CODE = process.env.REQUIRE_CODE === "1"; // REQUIRE_CODE=1: students must type the counter code (stops remote fake votes)
const MENU = {
  breakfast: ["Poha", "Upma", "Idli Sambar", "Aloo Paratha", "Tea", "Banana"],
  lunch: ["Dal Tadka", "Shahi Paneer", "Jeera Rice", "Tawa Roti", "Salad", "Curd"],
  dinner: ["Rajma", "Mixed Veg", "Steamed Rice", "Chapati", "Kheer", "Papad"],
};
const PUBLIC_TAGS = Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [k, { label: v.label, icon: v.icon }]));
const codeFor = (meal, date) =>
  String(
    parseInt(
      crypto
        .createHmac("sha256", PIN + "messmate")
        .update(meal + date)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 10000,
  ).padStart(4, "0");
const today = (o = 0) => new Date(Date.now() - o * 864e5).toLocaleDateString("en-CA", { timeZone: TZ }),
  cap = (s) => s[0].toUpperCase() + s.slice(1);

function seed() {
  // demo data: dinner has hygiene + salt problems, lunch is healthy, breakfast is mixed
  const pick = (a) => a[Math.floor(Math.random() * a.length)],
    rnd = (lo, hi) => Math.max(1, Math.min(5, Math.round(lo + Math.random() * (hi - lo)))),
    k = { n: 0 };
  const P = {
    breakfast: { s: [3, 3, 3, 3.6, 4], c: ["poha was tasty", "tea thanda tha", "queue too long", "", "idli mast"] },
    lunch: { s: [3, 3, 3, 4, 4.4], c: ["dal was great", "roti cold", "", "tasty paneer", ""] },
    dinner: {
      s: [3, 4.6, 3, 2.4, 2.2],
      c: ["rajma too salty", "hair in rice", "dirty plates", "rice kaccha", "kam quantity", ""],
    },
  };
  for (let d = 0; d < 7; d++)
    Object.keys(P).forEach((meal) => {
      const p = P[meal],
        n = d === 0 ? 20 : 12;
      for (let i = 0; i < n; i++) {
        const r = {
          spice: rnd(p.s[0] - 1, p.s[0] + 1),
          salt: rnd(p.s[1] - 1, p.s[1] + 0.6),
          sweetness: rnd(2, 4),
          quality: rnd(p.s[3] - 1.2, p.s[3] + 1),
          hygiene: rnd(p.s[4] - 1.2, p.s[4] + 1),
          variety: rnd(2, 5),
        };
        const h = (r.quality + r.hygiene + r.variety) / 3 - Math.abs(r.salt - 3) * 0.5 + (Math.random() - 0.5) * 1.2;
        store.add({
          date: today(d),
          meal,
          dishes: [...new Set([pick(MENU[meal]), pick(MENU[meal])])],
          verdict: h >= 3.7 ? "good" : h >= 2.7 ? "average" : "bad",
          ...r,
          comment: pick(p.c),
          device_id: "seed" + k.n++,
          ts: Date.now() - d * 864e5 - i * 6e4,
        });
      }
    });
}
if (process.argv.includes("--reset")) store.reset();
if (!store.count()) {
  seed();
  console.log("Seeded demo data");
}

const send = (res, code, b) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(b));
};
const body = (req) =>
  new Promise((r) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        r(JSON.parse(s || "{}"));
      } catch {
        r(null);
      }
    });
  });
const hits = {}; // tiny in-memory rate limiter per IP
const recent = (req, key) => {
  const k = key + req.socket.remoteAddress,
    now = Date.now();
  return (hits[k] = (hits[k] || []).filter((t) => now - t < 6e4));
};
const limited = (req, key, max) => {
  const a = recent(req, key);
  a.push(Date.now());
  return a.length > max;
}; // counts every call
const locked = (req, key, max) => recent(req, key).length >= max; // read-only check
const failed = (req, key) => recent(req, key).push(Date.now()); // record a wrong PIN
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" },
  cache = {};
async function digestFor(meal, date, rows) {
  // LLM first, rule-based fallback if no key / error / invalid JSON / too few responses
  const a = analyze(rows),
    key = meal + date + rows.length;
  if (cache[key]) return cache[key];
  let ai = null;
  if (rows.length >= 5)
    try {
      ai = await llm.digest(a, rows);
    } catch (e) {
      console.log("LLM failed, using rules:", e.message);
    }
  const rules = {
    source: "rules",
    summary: a.headline,
    went_wrong: a.problems
      .slice(0, 3)
      .map((p) => ({ title: cap(p.issue), evidence: `${p.dim} avg ${p.mean}/5, ${p.offPct}% flagged`, fix: p.fix })),
    went_right: a.strengths.map((s) => `${s.dim} avg ${s.mean}/5`),
    comment_themes: a.themes.map((t) => t.theme),
  };
  if (!ai) return rules; // never cache fallbacks, so a transient API error can't stick
  return (cache[key] = { source: "llm", model: llm.MODEL, ...ai });
}
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x"),
      p = u.pathname,
      q = u.searchParams,
      meal = q.get("meal"),
      date = q.get("date") || today();
    if (p === "/api/menu") return send(res, 200, { menu: MENU, date: today(), tags: PUBLIC_TAGS, needCode: REQUIRE_CODE });
    if (p === "/api/pulse") {
      // public, aggregate-only: satisfaction and best dish per meal, hidden until 5+ responses
      const out = {};
      for (const m of Object.keys(MENU)) {
        const rows = store.rows(m, today(), today()),
          ok = rows.length >= 5,
          a = ok ? analyze(rows) : null;
        out[m] = {
          n: rows.length,
          satisfaction: ok ? a.satisfaction : null,
          best: ok ? ([...a.dishes].sort((x, y) => y.satisfaction - x.satisfaction)[0] || {}).name || null : null,
        };
      }
      return send(res, 200, out);
    }
    if (p === "/api/pin" && req.method === "POST") {
      if (locked(req, "auth", 6)) return send(res, 429, { error: "Too many wrong PINs. Wait a minute." });
      const b = await body(req),
        ok = !!b && b.pin === PIN;
      if (!ok) failed(req, "auth");
      return send(res, ok ? 200 : 401, { ok });
    }
    if (p === "/api/parse" && req.method === "POST") {
      // AI step 1: one free-text line -> tags the student confirms
      if (limited(req, "parse", 30)) return send(res, 429, { error: "Slow down a little." });
      const b = await body(req),
        text = String((b && b.text) || "")
          .trim()
          .slice(0, 140);
      if (!b || !MENU[b.meal] || !text) return send(res, 400, { error: "meal and text required" });
      let out = null,
        source = "rules";
      try {
        out = await llm.parse(text, b.meal, MENU[b.meal]);
        if (out) source = "llm";
      } catch (e) {
        console.log("parse fell back to rules:", e.message);
      }
      if (!out) {
        const tags = detect(text);
        out = {
          tags,
          verdict: guessVerdict(tags, text),
          dishes: detectDishes(text, MENU[b.meal]),
        };
      }
      return send(res, 200, { source, ...out });
    }
    if (p === "/api/demo/reset-device" && req.method === "POST") {
      const b = await body(req);
      if (b && b.device_id && b.meal) {
        store.clearDevice(String(b.device_id), b.meal, today());
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { error: "device_id and meal required" });
    }
    if (p === "/api/config") {
      if (req.method === "GET") {
        return send(res, 200, { aiEnabled: llm.enabled, model: llm.MODEL, requireCode: REQUIRE_CODE });
      }
      if (req.method === "POST") {
        if (req.headers["x-pin"] !== PIN) return send(res, 401, { error: "Manager PIN required" });
        const b = await body(req);
        if (b && typeof b.apiKey === "string") {
          llm.setKey(b.apiKey.trim());
          for (const k of Object.keys(cache)) delete cache[k];
          return send(res, 200, { ok: true, aiEnabled: llm.enabled, model: llm.MODEL });
        }
        return send(res, 400, { error: "apiKey string required" });
      }
    }
    if (p === "/api/feedback" && req.method === "POST") {
      if (limited(req, "fb", 120)) return send(res, 429, { error: "Too many submissions. Try again shortly." });
      const b = await body(req);
      if (!b || !MENU[b.meal] || !b.device_id)
        return send(res, 400, { error: "meal and device_id are required" });

      const comment = String(b.comment || "").slice(0, 140);
      let tags = [...new Set(Array.isArray(b.tags) ? b.tags.filter((t) => TAGS[t]) : [])].slice(0, 6);
      if (!tags.length && comment) {
        tags = detect(comment);
      }

      let verdict = ["good", "average", "bad"].includes(b.verdict) ? b.verdict : null;
      if (!verdict && comment) {
        verdict = guessVerdict(tags, comment) || "average";
      }
      if (!verdict) {
        return send(res, 400, { error: "Please select an overall rating (Good, Average, or Bad) or describe your meal." });
      }

      let dishes = (b.dishes || []).filter((d) => MENU[b.meal].includes(d));
      if (!dishes.length && comment) {
        dishes = detectDishes(comment, MENU[b.meal]);
      }

      if (REQUIRE_CODE && String(b.code || "") !== codeFor(b.meal, today())) return send(res, 403, { error: "BAD_CODE" });
      if (store.dup(String(b.device_id), b.meal, today())) return send(res, 409, { error: "DUPLICATE" });
      const row = {
        date: today(),
        meal: b.meal,
        verdict,
        dishes,
        tags,
        comment,
        device_id: String(b.device_id).slice(0, 64),
        ts: Date.now(),
      };
      const fromTags = ratingsFromTags(row.tags); // hand-set ratings win; confirmed tags fill the gaps; otherwise null (never a fake 3)
      DIMS.forEach((d) => {
        const v = parseInt(b[d]);
        row[d] = v >= 1 && v <= 5 ? v : fromTags[d] || null;
      });
      try {
        store.add(row);
      } catch {
        return send(res, 409, { error: "DUPLICATE" });
      }
      return send(res, 201, { ok: true, verdict, tags, dishes });
    }
    if ((p.startsWith("/api/") && !["/api/menu", "/api/pin"].includes(p)) || p === "/api/feedback") {
      if (locked(req, "auth", 6)) return send(res, 429, { error: "Too many wrong PINs. Wait a minute." });
      if (req.headers["x-pin"] !== PIN) {
        failed(req, "auth");
        return send(res, 401, { error: "Manager PIN required" });
      }
      if (!MENU[meal]) return send(res, 400, { error: "meal required" });
      const rows = store.rows(meal, date, date);
      if (p === "/api/code") return send(res, 200, { code: codeFor(meal, today()), required: REQUIRE_CODE });
      if (p === "/api/analysis") return send(res, 200, { meal, date, ...analyze(rows) });
      if (p === "/api/digest") return send(res, 200, await digestFor(meal, date, rows));
      if (p === "/api/feedback") return send(res, 200, { rows: rows.slice(0, 50) });
      if (p === "/api/trend") {
        const all = store.rows(meal, today(6), today()),
          days = [];
        for (let i = 6; i >= 0; i--) {
          const d = today(i),
            r = all.filter((x) => x.date === d);
          days.push({
            label: new Date(d + "T12:00").toLocaleDateString("en", { weekday: "short" }),
            n: r.length,
            satisfaction: r.length ? analyze(r).satisfaction : 0,
          });
        }
        return send(res, 200, { days });
      }
    }
    const file = path.join(__dirname, "public", p === "/" ? "index.html" : p);
    if (file.startsWith(path.join(__dirname, "public")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      return res.end(fs.readFileSync(file));
    }
    send(res, 404, { error: "Not found" });
  })
  .listen(PORT, () =>
    console.log(
      `MessMate: http://localhost:${PORT} | PIN ${PIN} | DB ${store.kind} | AI ${llm.enabled ? llm.MODEL : "off (rule-based fallback)"}`,
    ),
  );
