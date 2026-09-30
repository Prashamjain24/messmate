const $ = (s) => document.querySelector(s),
  app = $("#app"),
  cta = $("#cta"),
  btn = $("#submit");

const DIMS = [
  ["spice", "Spice", "Too mild", "Too spicy"],
  ["salt", "Salt", "Too little", "Too salty"],
  ["sweetness", "Sweetness", "Not sweet", "Too sweet"],
  ["quality", "Quality", "Poor", "Excellent"],
  ["hygiene", "Hygiene", "Dirty", "Spotless"],
  ["variety", "Variety", "Boring", "Great mix"],
];
const NAMES = Object.fromEntries(DIMS.map((d) => [d[0], d[1]]));
const EMO = {
  Poha: "🍚",
  Upma: "🥣",
  "Idli Sambar": "🍥",
  "Aloo Paratha": "🫓",
  Tea: "🍵",
  Banana: "🍌",
  "Dal Tadka": "🍲",
  "Shahi Paneer": "🧀",
  "Jeera Rice": "🍚",
  "Tawa Roti": "🫓",
  Salad: "🥗",
  Curd: "🥛",
  Rajma: "🫘",
  "Mixed Veg": "🥦",
  "Steamed Rice": "🍚",
  Chapati: "🫓",
  Kheer: "🍮",
  Papad: "🍘",
};
const TIMES = { breakfast: "7:30–9:30 AM", lunch: "12:30–2:30 PM", dinner: "7:30–9:30 PM" };
let MENU = {},
  meal = ((h) => (h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner"))(new Date().getHours());

const dev = localStorage.mm_dev || (localStorage.mm_dev = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

const api = async (u, o = {}) => {
  try {
    const r = await fetch(u, o);
    return { ok: r.ok, status: r.status, data: await r.json() };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
};

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";

function pills() {
  return `<div class="pills">${["breakfast", "lunch", "dinner"].map((m) => `<button data-m="${m}" class="${m === meal ? "on" : ""}">${cap(m)}</button>`).join("")}</div>`;
}

function bindPills(fn) {
  app.querySelectorAll("[data-m]").forEach(
    (b) =>
      (b.onclick = () => {
        meal = b.dataset.m;
        fn();
      }),
  );
}

function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0;
  u.lang = "en-IN";
  window.speechSynthesis.speak(u);
}

/* ---------- Student Flow ---------- */
let F,
  TAGDEF = null,
  NEEDCODE = false,
  CODE = (location.hash.match(/[?&]c=(\d{4})/) || [])[1] || "",
  startTime = Date.now(),
  parseTimer = null,
  activeSpeechRec = null,
  isListening = false;

const fresh = () => {
  F = { dishes: [], verdict: null, ratings: {}, comment: "", tags: [], parsed: null, suggested: false };
  startTime = Date.now();
};
fresh();

const ready = () => {
  // Enabled if verdict is chosen, or if student has written a comment, or picked tags
  btn.disabled = !F.verdict && !F.comment.trim() && !F.tags.length;
};

const OFFLINE =
  '<div class="card center"><div class="big">📡</div><h2>Can’t reach the server</h2><p class="muted">Check your connection and try again.</p></div>';

const POPULAR_QUICK_TAGS = [
  ["too_salty", "🧂 Too salty", "bad"],
  ["cold", "🥶 Served cold", "bad"],
  ["tasty", "😋 Delicious", "good"],
  ["too_spicy", "🌶️ Too spicy", "bad"],
  ["dirty", "🪰 Dirty/Hair", "bad"],
  ["small_portion", "🍽 Small portion", "average"],
  ["clean", "✨ Clean mess", "good"],
  ["raw", "🥔 Undercooked", "bad"],
];

const SAMPLE_VOICE_PROMPTS = [
  "rajma bahut namkeen tha, roti thandi",
  "dal tadka was great, paneer fresh and tasty",
  "rice mein baal tha, plates dirty",
  "khana bahut teekha aur oily hai",
  "khana bohot accha tha, swad aa gaya",
];

async function student() {
  cta.classList.remove("hide");
  btn.textContent = "Submit feedback";
  btn.onclick = send;
  startTime = Date.now();

  if (!MENU[meal] || !TAGDEF) {
    const r = await api("/api/menu");
    if (!r.ok) {
      app.innerHTML = OFFLINE;
      btn.disabled = false;
      btn.textContent = "Retry";
      btn.onclick = student;
      return;
    }
    MENU = r.data.menu;
    TAGDEF = r.data.tags;
    NEEDCODE = r.data.needCode;
    $("#live").textContent = new Date(r.data.date).toDateString().slice(0, 10);
  }

  const todayKey = "mm_done_" + meal + new Date().toDateString();
  if (localStorage[todayKey]) {
    app.innerHTML = `${pills()}
    <div class="card center">
      <div class="big">✅</div>
      <h2>Already rated today’s ${meal}</h2>
      <p class="muted">You’ve already submitted your feedback. You can rate the next meal when it is served.</p>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn alt" style="margin-top:0;width:auto;padding:10px 16px" id="demoReset">🔄 Rate Again (Demo Reset)</button>
        <button class="btn alt" style="margin-top:0;width:auto;padding:10px 16px" onclick="location.hash='#/'">Back to home</button>
      </div>
    </div>`;
    bindPills(() => {
      fresh();
      student();
    });
    const rst = $("#demoReset");
    if (rst) {
      rst.onclick = async () => {
        rst.textContent = "Resetting…";
        await api("/api/demo/reset-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: dev, meal }),
        });
        delete localStorage[todayKey];
        fresh();
        student();
      };
    }
    cta.classList.add("hide");
    return;
  }

  const ask = NEEDCODE && !CODE ? codeField("") : "";
  app.innerHTML = `${pills()}
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div class="speed-badge">⚡ &lt;10s Feedback Guarantee</div>
    <span class="sm muted" id="stopwatch">⏱️ Ready</span>
  </div>

  <div class="card">
    <h2>How was your ${meal}?</h2>
    <div class="verd">${[
      ["good", "😋", "Good"],
      ["average", "😐", "Average"],
      ["bad", "😖", "Bad"],
    ]
      .map((v) => `<button data-v="${v[0]}" class="${v[0]} ${F.verdict === v[0] ? "on" : ""}"><span>${v[1]}</span>${v[2]}</button>`)
      .join("")}</div>
    
    <div style="margin-top:10px">
      <div class="sm muted" style="margin-bottom:4px">Tap quick tags for instant rating:</div>
      <div class="quick-tags">
        ${POPULAR_QUICK_TAGS.map(([code, label, verd]) => `<button type="button" class="quick-chip ${F.tags.includes(code) ? "on" : ""}" data-qt="${code}" data-qv="${verd}">${label}</button>`).join("")}
      </div>
    </div>
  </div>

  <div class="card ai">
    <h2>✨ Say or write in one line</h2>
    <div class="sm muted">Hindi, English or Hinglish. We turn it into tags automatically!</div>
    <div class="say">
      <input id="say" class="pin" maxlength="140" placeholder="e.g. rajma bahut namkeen tha, roti thandi" value="${esc(F.comment)}">
      <button id="mic" class="ico" title="Speak feedback" aria-label="Speak">🎤</button>
      <button id="go" class="ico" title="Understand text" aria-label="Understand">→</button>
    </div>
    <div id="micStatus" class="mic-status hide"></div>
    <div id="voiceSamples" class="voice-samples hide">
      <div class="sm muted">💡 Audio presets (tap any to test Hinglish AI parser):</div>
      ${SAMPLE_VOICE_PROMPTS.map((p) => `<button type="button" class="voice-btn" data-vp="${esc(p)}">🎙️ “${esc(p)}”</button>`).join("")}
    </div>
    <div id="sug"></div>
  </div>

  <div class="card">
    <h2>What did you eat?</h2>
    <div class="sm muted">Optional: tap all that apply</div>
    <div class="dishes">${MENU[meal].map((d) => `<button class="dish ${F.dishes.includes(d) ? "on" : ""}" data-d="${esc(d)}"><span>${EMO[d] || "🍛"}</span>${esc(d)}</button>`).join("")}</div>
  </div>

  <details class="card">
    <summary><b>Rate details yourself</b> <span class="sm muted">(optional)</span></summary>
    ${DIMS.map((d) => `<div class="row"><b>${d[1]}</b><div class="scale" data-r="${d[0]}">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${F.ratings[d[0]] === n ? "on" : ""}">${n}</button>`).join("")}</div><div class="ends"><span>${d[2]}</span><span>${d[3]}</span></div></div>`).join("")}
  </details>
  <div id="msg" class="err">${ask}</div>`;

  bindPills(() => {
    fresh();
    student();
  });

  // Stopwatch counter
  const sw = $("#stopwatch");
  if (sw) {
    const swInterval = setInterval(() => {
      if (!sw || !document.contains(sw)) return clearInterval(swInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      sw.textContent = `⏱️ ${elapsed}s`;
    }, 1000);
  }

  // Dish selectors
  app.querySelectorAll("[data-d]").forEach(
    (b) =>
      (b.onclick = () => {
        const d = b.dataset.d;
        F.dishes = F.dishes.includes(d) ? F.dishes.filter((x) => x !== d) : [...F.dishes, d];
        b.classList.toggle("on");
      }),
  );

  // Verdict buttons
  app.querySelectorAll("[data-v]").forEach(
    (b) =>
      (b.onclick = () => {
        F.verdict = b.dataset.v;
        F.suggested = false;
        app.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("on", x === b));
        ready();
      }),
  );

  // Quick Tags
  app.querySelectorAll("[data-qt]").forEach(
    (b) =>
      (b.onclick = () => {
        const code = b.dataset.qt;
        const qv = b.dataset.qv;
        if (F.tags.includes(code)) {
          F.tags = F.tags.filter((x) => x !== code);
          b.classList.remove("on");
        } else {
          F.tags.push(code);
          b.classList.add("on");
          if (!F.verdict && qv) {
            F.verdict = qv;
            app.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("on", x.dataset.v === qv));
          }
        }
        renderSug();
        ready();
      }),
  );

  // Rating scales
  app.querySelectorAll("[data-r]").forEach((g) =>
    g.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          F.ratings[g.dataset.r] = +b.dataset.n;
          g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        }),
    ),
  );

  // Input & Auto-detection
  const say = $("#say");
  say.oninput = (e) => {
    F.comment = e.target.value;
    clearTimeout(parseTimer);
    if (F.comment.trim().length >= 4) {
      parseTimer = setTimeout(() => {
        liveParse(F.comment.trim());
      }, 400);
    }
    ready();
  };
  say.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      understand();
    }
  };
  $("#go").onclick = () => understand();

  // Voice recognition & audio setup
  setupAudio();

  renderSug();
  ready();
}

function setupAudio() {
  const mic = $("#mic");
  const micStatus = $("#micStatus");
  const voiceSamples = $("#voiceSamples");
  const say = $("#say");
  if (!mic) return;

  // Setup sample prompt buttons
  app.querySelectorAll("[data-vp]").forEach((b) => {
    b.onclick = () => {
      const text = b.dataset.vp;
      if (say) say.value = text;
      F.comment = text;
      if (micStatus) {
        micStatus.className = "mic-status";
        micStatus.innerHTML = `✅ Audio applied: “${esc(text)}”`;
        micStatus.classList.remove("hide");
      }
      understand();
    };
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  mic.onclick = () => {
    if (!SR) {
      // Browser does not support Web Speech API: show Voice Presets tray
      if (voiceSamples) voiceSamples.classList.toggle("hide");
      if (micStatus) {
        micStatus.className = "mic-status";
        micStatus.innerHTML = "ℹ️ Browser speech recognition unavailable. Choose a sample audio prompt below:";
        micStatus.classList.remove("hide");
      }
      return;
    }

    if (isListening && activeSpeechRec) {
      try {
        activeSpeechRec.stop();
      } catch {}
      return;
    }

    try {
      const r = new SR();
      r.lang = "hi-IN";
      r.continuous = false;
      r.interimResults = false;

      r.onstart = () => {
        isListening = true;
        activeSpeechRec = r;
        mic.classList.add("listening");
        mic.textContent = "⏹️";
        if (micStatus) {
          micStatus.className = "mic-status rec";
          micStatus.innerHTML = "🎙️ Listening... Speak now in Hindi or English (e.g. 'Rajma bahut namkeen tha')";
          micStatus.classList.remove("hide");
        }
      };

      r.onresult = (ev) => {
        const text = ev.results[0][0].transcript.slice(0, 140);
        if (say) say.value = text;
        F.comment = text;
        if (micStatus) {
          micStatus.className = "mic-status";
          micStatus.innerHTML = `✅ Heard: “${esc(text)}”`;
        }
        understand();
      };

      r.onerror = (ev) => {
        console.warn("Speech error:", ev.error);
        mic.classList.remove("listening");
        mic.textContent = "🎤";
        isListening = false;
        activeSpeechRec = null;

        if (micStatus) {
          micStatus.className = "mic-status";
          micStatus.classList.remove("hide");
          if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
            micStatus.innerHTML = "⚠️ Mic permission denied. Pick a sample voice prompt below:";
            if (voiceSamples) voiceSamples.classList.remove("hide");
          } else if (ev.error === "no-speech") {
            micStatus.innerHTML = "⚠️ No speech detected. Tap 🎤 to try again.";
          } else {
            micStatus.innerHTML = `⚠️ Speech error (${ev.error}). Pick a sample prompt below:`;
            if (voiceSamples) voiceSamples.classList.remove("hide");
          }
        }
      };

      r.onend = () => {
        mic.classList.remove("listening");
        mic.textContent = "🎤";
        isListening = false;
        activeSpeechRec = null;
      };

      r.start();
    } catch (err) {
      console.warn("Speech start exception:", err);
      if (voiceSamples) voiceSamples.classList.remove("hide");
    }
  };
}

// Live debounced parse for smooth typing
async function liveParse(text) {
  if (!text) return;
  const r = await api("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meal, text }),
  });
  if (r.ok && r.data) {
    F.parsed = r.data;
    F.tags = [...new Set([...F.tags, ...r.data.tags])];
    if (!F.verdict && r.data.verdict) {
      F.verdict = r.data.verdict;
      F.suggested = true;
      app.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("on", x.dataset.v === F.verdict));
    }
    if (r.data.dishes) {
      r.data.dishes.forEach((d) => {
        if (!F.dishes.includes(d)) F.dishes.push(d);
      });
      app.querySelectorAll("[data-d]").forEach((b) => b.classList.toggle("on", F.dishes.includes(b.dataset.d)));
    }
    renderSug();
    ready();
  }
}

// AI step: free text becomes tags
async function understand() {
  const text = F.comment.trim();
  if (!text) return;
  const sug = $("#sug");
  if (sug) sug.innerHTML = '<p class="muted sm">✨ Understanding your feedback…</p>';
  const r = await api("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meal, text }),
  });
  F.parsed = r.ok ? r.data : { tags: [], verdict: null, dishes: [], source: "none" };
  F.tags = [...new Set([...F.tags, ...F.parsed.tags])];
  if (!F.verdict && F.parsed.verdict) {
    F.verdict = F.parsed.verdict;
    F.suggested = true;
    app.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("on", x.dataset.v === F.verdict));
  }
  if (F.parsed.dishes) {
    F.parsed.dishes.forEach((d) => {
      if (!F.dishes.includes(d)) F.dishes.push(d);
    });
    app.querySelectorAll("[data-d]").forEach((b) => b.classList.toggle("on", F.dishes.includes(b.dataset.d)));
  }
  renderSug();
  ready();
}

function renderSug() {
  const sug = $("#sug");
  if (!sug) return;
  const P = F.parsed;
  if (!TAGDEF) return;

  const chip = (c) =>
    `<button type="button" class="chip ${F.tags.includes(c) ? "on" : ""}" data-t="${c}">${TAGDEF[c] ? TAGDEF[c].icon : "🏷️"} ${esc(TAGDEF[c] ? TAGDEF[c].label : c)}</button>`;

  if (!P && !F.tags.length) {
    sug.innerHTML = "";
    return;
  }

  const src = P && P.source === "llm" ? "Gemini AI" : P && P.source === "rules" ? "Hinglish Rules" : "";
  const displayTags = [...new Set([...(P ? P.tags : []), ...F.tags])];

  sug.innerHTML = `
    <p class="sm" style="margin:12px 0 0">
      <b>${displayTags.length ? "AI identified these issues (tap to toggle):" : "Couldn’t identify specific tags. Tap anything that applies:"}</b>
      ${src ? `<span class="tag ${P.source === "llm" ? "g" : "r"}">${src}</span>` : ""}
    </p>
    <div class="chips">${displayTags.map(chip).join("")}</div>
    ${F.suggested ? '<p class="sm muted" style="margin-top:6px">Overall verdict suggested from your text. You can change it above.</p>' : ""}
    <details ${displayTags.length ? "" : "open"}>
      <summary class="sm muted" style="margin-top:8px;cursor:pointer">＋ Add other issues</summary>
      <div class="chips">${Object.keys(TAGDEF)
        .filter((c) => !displayTags.includes(c))
        .map(chip)
        .join("")}</div>
    </details>`;

  sug.querySelectorAll("[data-t]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = b.dataset.t;
        F.tags = F.tags.includes(c) ? F.tags.filter((x) => x !== c) : [...F.tags, c];
        b.classList.toggle("on");
        ready();
      }),
  );
}

const codeField = (v) =>
  `Enter the 4-digit code shown at the mess counter:<input id="code" class="pin" inputmode="numeric" maxlength="4" value="${esc(v)}" style="margin-top:8px">`;

async function send() {
  btn.disabled = true;
  btn.textContent = "Sending…";
  const code = $("#code") ? $("#code").value.trim() : CODE;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // If text is written but no verdict selected, backend auto-infers it
  const r = await api("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meal,
      device_id: dev,
      dishes: F.dishes,
      verdict: F.verdict,
      comment: F.comment,
      tags: F.tags,
      code,
      ...F.ratings,
    }),
  });

  btn.textContent = "Submit feedback";
  if (r.ok || r.status === 409) {
    localStorage["mm_done_" + meal + new Date().toDateString()] = 1;
    cta.classList.add("hide");
    app.innerHTML = `
      <div class="card center">
        <div class="big">${r.ok ? "🎉" : "✅"}</div>
        <h2>${r.ok ? "Thanks for your feedback!" : "Already recorded"}</h2>
        <div class="speed-badge" style="margin:10px auto">⚡ Submitted in ${elapsed}s · Under 10s constraint met!</div>
        <p class="muted">${r.ok ? "The mess staff and manager will see your input in today’s digest." : "We already have your rating for this meal."}</p>
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn alt" style="margin-top:0;width:auto;padding:12px 20px" onclick="fresh();student()">Rate another meal</button>
          <button class="btn alt" style="margin-top:0;width:auto;padding:12px 20px" onclick="location.hash='#/'">Back to home</button>
        </div>
      </div>`;
    return;
  }

  btn.disabled = false;
  if (r.status === 403) {
    $("#msg").innerHTML = codeField(code);
    return;
  }
  $("#msg").textContent = r.status
    ? r.data.error || "Something went wrong."
    : "No connection. Your answers are kept. Tap submit to retry.";
}

/* ---------- Manager Flow ---------- */
let PINV = sessionStorage.mm_pin || "";
let pinBuf = "";

function gate(err) {
  pinBuf = "";
  cta.classList.add("hide");
  $("#n1").className = "";
  $("#n2").className = "on";
  app.innerHTML = `<div class="card center"><div class="big">🔒</div><h2>Mess staff access</h2><p class="muted">Enter the 4-digit PIN. Demo PIN: 1234</p><div class="dots" id="dots">○○○○</div><p class="err">${err || ""}</p><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "⌫"].map((k) => `<button data-k="${k}">${k}</button>`).join("")}</div></div>`;
  app.querySelectorAll("[data-k]").forEach(
    (b) =>
      (b.onclick = async () => {
        const k = b.dataset.k;
        pinBuf = k === "C" ? "" : k === "⌫" ? pinBuf.slice(0, -1) : (pinBuf + k).slice(0, 4);
        $("#dots").textContent = "●".repeat(pinBuf.length) + "○".repeat(4 - pinBuf.length);
        if (pinBuf.length === 4) {
          const r = await api("/api/pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: pinBuf }),
          });
          if (r.ok) {
            PINV = pinBuf;
            sessionStorage.mm_pin = PINV;
            manager();
          } else gate(r.status === 429 ? r.data.error : "Wrong PIN. Try again.");
        }
      }),
  );
}

let lastDigestData = null;

async function manager() {
  if (!PINV) return gate();
  $("#n1").className = "";
  $("#n2").className = "on";
  cta.classList.add("hide");
  app.innerHTML = pills() + '<div class="card center muted">Analysing feedback…</div>';
  bindPills(manager);

  const H = { "x-pin": PINV },
    [a, raw] = await Promise.all([
      api("/api/analysis?meal=" + meal, { headers: H }),
      api("/api/feedback?meal=" + meal, { headers: H }),
    ]);

  if (a.status === 401) {
    PINV = "";
    sessionStorage.mm_pin = "";
    return gate("Session expired. Enter the PIN again.");
  }
  if (!a.ok) {
    app.innerHTML = pills() + '<div class="card center err">Couldn’t load the digest. Check the server and refresh.</div>';
    return bindPills(manager);
  }

  const d = a.data;
  bindPills(manager);
  if (!d.n) {
    app.innerHTML =
      pills() +
      `<div class="card center"><div class="big">🍽</div><h2>No feedback yet</h2><p class="muted">Responses for ${meal} will appear here as students submit them.</p></div>`;
    return bindPills(manager);
  }

  const lowConf = d.confidence !== "high";
  const bars = d.dims
    .map((x) => {
      if (x.status === "na")
        return `<div class="line"><span>${NAMES[x.key]}</span><div class="bar"></div><span class="sm" style="width:84px;font-weight:500">Too few ratings</span></div>`;
      const bal = x.direction !== null,
        pct = bal ? 100 - Math.min(100, Math.abs(x.mean - 3) * 50) : x.mean * 20;
      const lbl = bal
        ? x.direction === "ok"
          ? "Just right"
          : x.direction === "high"
            ? "Too " + (x.key === "salt" ? "salty" : x.key === "spice" ? "spicy" : "sweet")
            : "Too little"
        : x.mean + "/5";
      return `<div class="line"><span>${NAMES[x.key]}</span><div class="bar ${x.status === "wrong" ? "w" : x.status === "watch" ? "m" : ""}"><i style="width:${pct}%"></i></div><span class="sm" style="width:84px;font-weight:500">${lbl}</span></div>`;
    })
    .join("");

  const allComments = (raw.data.rows || []).filter((r) => r.comment);

  app.innerHTML =
    pills() +
    `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:16px">${cap(meal)} Overview</h2>
      <button id="btnExport" class="btn-sm">📥 Export Report</button>
    </div>
    <div class="kpis" style="margin-top:10px">
      <div class="kpi"><b>${d.satisfaction}%</b><span class="sm muted">Satisfaction</span></div>
      <div class="kpi"><b>${d.n}</b><span class="sm muted">Responses</span></div>
      <div class="kpi"><b>${d.verdicts.bad}</b><span class="sm muted">Rated bad</span></div>
    </div>
    ${lowConf ? `<p class="tag" style="display:inline-block;margin-top:10px">${d.confidence === "insufficient" ? "Too few responses. Check raw feedback below." : "Low confidence: fewer than 15 responses"}</p>` : ""}
    <p class="h" style="font-weight:700;margin:12px 0 0">${esc(d.headline)}</p>
  </div>

  <div class="card ai" id="ai">
    <h2>✨ AI digest</h2>
    <p class="muted">Writing summary…</p>
  </div>

  <div class="card">
    <details>
      <summary style="display:flex;justify-content:space-between;align-items:center">
        <b>⚙️ Gemini AI Settings & Status</b>
        <span class="sm muted">Click to configure</span>
      </summary>
      <div style="margin-top:10px">
        <p class="sm muted">You can enter a Gemini API Key here (or use the built-in Hinglish offline rule fallback):</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="geminiKey" class="pin" type="password" placeholder="Paste GEMINI_API_KEY">
          <button id="saveKey" class="btn-sm" style="background:var(--p);color:#fff;padding:8px 16px">Save</button>
        </div>
        <p id="keyMsg" class="sm" style="margin-top:6px"></p>
      </div>
    </details>
  </div>

  <div class="card">
    <h2>Last 7 days</h2>
    <div id="trend" class="muted">Loading…</div>
  </div>

  <div class="card">
    <h2>What’s working</h2>
    ${d.strengths.length ? d.strengths.map((s) => `<div class="issue ok"><b>${NAMES[s.dim]}</b> <span class="sm muted">avg ${s.mean}/5</span></div>`).join("") : '<p class="muted">No standout strengths yet.</p>'}
  </div>

  <div class="card">
    <h2>Score breakdown</h2>
    ${bars}
    <p class="sm muted" style="margin-top:12px">Biggest drivers of overall satisfaction: <b>${d.drivers.map((k) => NAMES[k]).join(" and ")}</b></p>
  </div>

  <div class="card">
    <h2>By dish</h2>
    ${d.dishes.map((x) => `<div class="line"><span style="width:110px">${esc(x.name)}</span><div class="bar ${x.satisfaction < 50 ? "w" : x.satisfaction < 70 ? "m" : ""}"><i style="width:${x.satisfaction}%"></i></div><span class="sm" style="width:64px">${x.satisfaction}% (${x.n})</span></div>`).join("")}
  </div>

  ${d.themes.length ? `<div class="card"><h2>Comment themes</h2><div class="chips">${d.themes.map((t) => `<span class="chip">${esc(t.theme)} · ${t.count}</span>`).join("")}</div></div>` : ""}

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2>Recent comments (${allComments.length})</h2>
    </div>
    <input id="searchComments" class="search-box" placeholder="🔍 Search comments by dish or issue (e.g. salt, dal, cold)...">
    <div id="commentsList" style="margin-top:8px">
      ${renderComments(allComments)}
    </div>
  </div>`;

  bindPills(manager);

  // Setup search filter for comments
  const searchInput = $("#searchComments");
  if (searchInput) {
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allComments.filter((r) => r.comment.toLowerCase().includes(q) || r.verdict.toLowerCase().includes(q));
      const list = $("#commentsList");
      if (list) list.innerHTML = renderComments(filtered);
    };
  }

  // Setup API key configuration
  const saveKeyBtn = $("#saveKey");
  if (saveKeyBtn) {
    saveKeyBtn.onclick = async () => {
      const key = $("#geminiKey").value.trim();
      saveKeyBtn.disabled = true;
      saveKeyBtn.textContent = "Saving…";
      const r = await api("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-pin": PINV },
        body: JSON.stringify({ apiKey: key }),
      });
      saveKeyBtn.disabled = false;
      saveKeyBtn.textContent = "Save";
      const msg = $("#keyMsg");
      if (r.ok) {
        msg.textContent = "✅ Gemini API key updated! Refreshing digest…";
        msg.className = "sm tag g";
        setTimeout(manager, 800);
      } else {
        msg.textContent = "❌ Error updating key: " + (r.data.error || "Failed");
        msg.className = "sm err";
      }
    };
  }

  // Setup Export
  const expBtn = $("#btnExport");
  if (expBtn) {
    expBtn.onclick = () => exportReport(d, allComments);
  }

  extras(H);
}

function renderComments(rows) {
  if (!rows || !rows.length) return '<p class="muted">No matching comments.</p>';
  return rows
    .slice(0, 12)
    .map(
      (r) =>
        `<p style="margin:8px 0;padding:6px 0;border-bottom:1px solid var(--line)">“${esc(r.comment)}” <span class="tag ${r.verdict === "good" ? "g" : r.verdict === "bad" ? "r" : ""}" style="margin-left:6px">${r.verdict}</span></p>`,
    )
    .join("");
}

function exportReport(d, comments) {
  const text = `MessMate Daily Digest - ${cap(meal)}
Date: ${new Date().toLocaleDateString()}
Satisfaction: ${d.satisfaction}% (${d.n} responses, ${d.verdicts.bad} rated bad)
Headline: ${d.headline}

Problems Identified:
${(d.problems || []).map((p) => `- ${p.issue} (${p.dim}): Fix: ${p.fix}`).join("\n")}

Dishes:
${(d.dishes || []).map((x) => `- ${x.name}: ${x.satisfaction}% satisfaction (${x.n} ratings)`).join("\n")}

Recent Student Comments:
${comments.slice(0, 10).map((r) => `"${r.comment}" [${r.verdict}]`).join("\n")}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    alert("Report copied to clipboard!");
  } else {
    prompt("Copy Report:", text);
  }
}

async function extras(H) {
  const [t, g, c] = await Promise.all([
      api("/api/trend?meal=" + meal, { headers: H }),
      api("/api/digest?meal=" + meal, { headers: H }),
      api("/api/code?meal=" + meal, { headers: H }),
    ]),
    tr = $("#trend"),
    ai = $("#ai");

  if (c.ok && app.lastElementChild) {
    app.insertAdjacentHTML(
      "beforeend",
      `<div class="card">
        <h2>Counter code</h2>
        <p class="muted">Print it at the serving counter: <b style="font-size:22px;color:var(--ink)">${c.data.code}</b><br>
        QR link for students: <span class="sm">${location.origin}/#/rate?c=${c.data.code}</span><br>
        ${c.data.required ? "Enforced: only people at the counter can rate." : "Not enforced yet. Start the server with REQUIRE_CODE=1 to block remote fake votes."}</p>
      </div>`,
    );
  }

  if (tr && t.ok) {
    tr.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-end;height:120px">${t.data.days.map((x) => `<div style="flex:1;text-align:center"><div class="sm">${x.n ? x.satisfaction + "%" : "–"}</div><div style="height:${Math.max(3, x.satisfaction * 0.85)}px;background:${x.satisfaction < 50 ? "var(--err)" : "var(--pc)"};border-radius:8px 8px 0 0"></div><div class="sm muted">${x.label}</div></div>`).join("")}</div>`;
  }

  if (!ai) return;
  if (!g.ok) {
    ai.innerHTML = '<h2>✨ AI digest</h2><p class="muted">Summary unavailable. See the scores below.</p>';
    return;
  }

  const a = g.data;
  lastDigestData = a;

  const fixStates = JSON.parse(localStorage.mm_fixes || "{}");

  ai.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <h2>✨ AI digest <span class="tag ${a.source === "llm" ? "g" : "r"}">${a.source === "llm" ? "Gemini" : "Rule-based"}</span>${a.verified ? ' <span class="tag g">Numbers verified</span>' : ""}</h2>
      <button id="btnListen" class="btn-sm">🔊 Listen to Brief</button>
    </div>
    <p class="h" style="font-weight:600;margin:10px 0">${esc(a.summary)}</p>
    ${(a.went_wrong || [])
      .map((x, i) => {
        const key = meal + "_" + x.dim + "_" + i;
        const isDone = !!fixStates[key];
        return `<div class="issue ${isDone ? "ok" : ""}">
          <div style="display:flex;justify-content:space-between">
            <b>${esc(x.title)}</b>
            <label class="fix-check ${isDone ? "done" : ""}">
              <input type="checkbox" data-fix="${key}" ${isDone ? "checked" : ""}>
              <span>${isDone ? "Fix Done ✓" : "Mark Done"}</span>
            </label>
          </div>
          <div class="sm muted">${esc(x.evidence)}</div>
          <div class="fix">Action: ${esc(x.fix)}</div>
        </div>`;
      })
      .join("")}
    ${(a.went_right || []).length ? `<p style="margin:12px 0 0"><b>Working:</b> ${a.went_right.map(esc).join(" · ")}</p>` : ""}
    ${(a.comment_themes || []).length ? `<div class="chips">${a.comment_themes.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}`;

  // Fix checklist listener
  ai.querySelectorAll("[data-fix]").forEach((ck) => {
    ck.onchange = (e) => {
      const k = e.target.dataset.fix;
      fixStates[k] = e.target.checked;
      localStorage.mm_fixes = JSON.stringify(fixStates);
      manager();
    };
  });

  // Listen to Brief listener
  const listenBtn = $("#btnListen");
  if (listenBtn) {
    listenBtn.onclick = () => {
      const speech = `${cap(meal)} Mess Briefing. ${a.summary}. Fixes needed: ${(a.went_wrong || []).map((x) => x.fix).join(". ")}`;
      speakText(speech);
    };
  }
}

// Dark mode toggle
$("#dk").onclick = () => {
  const d = document.documentElement;
  d.dataset.t = d.dataset.t === "dark" ? "" : "dark";
  localStorage.mm_t = d.dataset.t;
};
document.documentElement.dataset.t = localStorage.mm_t || "";

/* ---------- Home Dashboard ---------- */
async function home() {
  cta.classList.add("hide");
  if (!MENU.lunch) {
    const m = await api("/api/menu");
    if (m.ok) {
      MENU = m.data.menu;
      $("#live").textContent = new Date(m.data.date).toDateString().slice(0, 10);
    }
  }
  if (!MENU.lunch) {
    app.innerHTML =
      '<div class="card center"><div class="big">📡</div><h2>Can’t reach the server</h2><p class="muted">Check your connection and try again.</p><button class="btn alt" onclick="home()">Retry</button></div>';
    return;
  }
  const p = await api("/api/pulse"),
    P = p.ok ? p.data : {},
    M = ["breakfast", "lunch", "dinner"],
    IC = { breakfast: "🌅", lunch: "☀️", dinner: "🌙" },
    done = (m) => localStorage["mm_done_" + m + new Date().toDateString()];
  const h = new Date().getHours(),
    hi = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
    sats = M.map((m) => P[m] && P[m].satisfaction).filter((x) => x != null),
    best = M.map((m) => P[m] && P[m].best).find(Boolean),
    tot = M.reduce((s, m) => s + (P[m] ? P[m].n : 0), 0);

  app.innerHTML = `
    <div class="hero">
      <div>
        <div class="h" style="font-size:22px;font-weight:700">${hi} 👋</div>
        <p>${cap(meal)} is being served · ${TIMES[meal]}</p>
        ${done(meal) ? `<div class="tag g" style="display:inline-block;margin-top:14px">You rated ${meal} ✓</div>` : `<button class="btn" style="background:#fff;color:var(--p);margin:14px 0 0" onclick="rate('${meal}')">Rate ${meal} · &lt;10s</button>`}
      </div>
      <div class="hbig">${IC[meal]}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><b>${tot}</b><span class="sm muted">Ratings today</span></div>
      <div class="kpi"><b>${sats.length ? Math.round(sats.reduce((a, b) => a + b) / sats.length) + "%" : "–"}</b><span class="sm muted">Mess rating</span></div>
      <div class="kpi"><b style="font-size:15px;line-height:24px">${best ? esc(best) : "–"}</b><span class="sm muted">Top dish</span></div>
    </div>
    <h2>Today’s meals</h2>
    ${M.map((m) => {
      const s = P[m] && P[m].satisfaction;
      return `<div class="card">
        <div class="mh">
          <span class="mi">${IC[m]}</span>
          <div><b class="h">${cap(m)}</b><div class="sm muted">${TIMES[m]}</div></div>
          <span class="tag ${s == null ? "" : s < 50 ? "r" : s >= 70 ? "g" : ""}" style="margin-left:auto">${s == null ? "Collecting feedback" : s + "% liked"}</span>
        </div>
        <div class="mdish">${MENU[m].map((d) => `<span>${EMO[d] || "🍛"} ${esc(d)}</span>`).join("")}</div>
        <button class="btn alt" ${done(m) ? "disabled" : ""} onclick="rate('${m}')">${done(m) ? "Rated ✓" : "Rate " + m + " (10s)"}</button>
      </div>`;
    }).join("")}`;
}

function rate(m) {
  meal = m;
  fresh();
  location.hash = "#/rate";
}

const setNav = (id) => ["n0", "n1", "n2"].forEach((x) => ($("#" + x).className = x === id ? "on" : ""));

const route = () => {
  const h = location.hash;
  if (h.startsWith("#/manager")) {
    setNav("n2");
    manager();
  } else if (h.startsWith("#/rate")) {
    setNav("n1");
    student();
  } else {
    setNav("n0");
    home();
  }
};

addEventListener("hashchange", route);
route();
