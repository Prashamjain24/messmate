// Database layer: SQLite (node:sqlite, Node >= 22.13) with automatic JSON-file fallback on older Node.
const fs = require("fs"),
  path = require("path");
let impl;
try {
  const { DatabaseSync } = require("node:sqlite"),
    db = new DatabaseSync(path.join(__dirname, "messmate.db"));
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  try {
    db.exec("ALTER TABLE feedback ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  } catch {} // upgrade older DB files
  const C = [
    "date",
    "meal",
    "dishes",
    "tags",
    "verdict",
    "spice",
    "salt",
    "sweetness",
    "quality",
    "hygiene",
    "variety",
    "comment",
    "device_id",
    "ts",
  ];
  const ins = db.prepare(`INSERT INTO feedback(${C}) VALUES(${C.map(() => "?")})`),
    sel = db.prepare("SELECT * FROM feedback WHERE meal=? AND date>=? AND date<=? ORDER BY ts DESC");
  const dup = db.prepare("SELECT 1 FROM feedback WHERE device_id=? AND meal=? AND date=?");
  const delDev = db.prepare("DELETE FROM feedback WHERE device_id=? AND meal=? AND date=?");
  impl = {
    kind: "sqlite",
    count: () => db.prepare("SELECT COUNT(*) c FROM feedback").get().c,
    rows: (m, a, b) => sel.all(m, a, b).map((r) => ({ ...r, dishes: JSON.parse(r.dishes), tags: JSON.parse(r.tags || "[]") })),
    dup: (d, m, t) => !!dup.get(d, m, t),
    clearDevice: (d, m, t) => delDev.run(d, m, t),
    add: (r) => ins.run(...C.map((k) => (k === "dishes" || k === "tags" ? JSON.stringify(r[k] || []) : r[k] === undefined ? null : r[k]))),
    reset: () => db.exec("DELETE FROM feedback"),
  };
} catch (e) {
  const P = path.join(__dirname, "data.json"),
    ld = () => (fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, "utf8")) : []);
  impl = {
    kind: "json",
    count: () => ld().length,
    rows: (m, a, b) =>
      ld()
        .filter((r) => r.meal === m && r.date >= a && r.date <= b)
        .sort((x, y) => y.ts - x.ts),
    dup: (d, m, t) => ld().some((r) => r.device_id === d && r.meal === m && r.date === t),
    clearDevice: (d, m, t) => fs.writeFileSync(P, JSON.stringify(ld().filter((r) => !(r.device_id === d && r.meal === m && r.date === t)))),
    add: (r) => fs.writeFileSync(P, JSON.stringify([...ld(), r])),
    reset: () => fs.writeFileSync(P, "[]"),
  };
}
module.exports = impl;
