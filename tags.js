// Shared vocabulary for feedback tags. The AI may only choose codes from this list, so it can never invent a rating.
// dim/val = the 1-5 rating a confirmed tag implies (used only when the student did not rate that dimension by hand).
const TAGS = {
  too_salty: { label: "Too salty", icon: "🧂", dim: "salt", val: 5 },
  low_salt: { label: "Needs more salt", icon: "🧂", dim: "salt", val: 1 },
  too_spicy: { label: "Too spicy", icon: "🌶️", dim: "spice", val: 5 },
  bland: { label: "Too bland", icon: "😶", dim: "spice", val: 1 },
  too_sweet: { label: "Too sweet", icon: "🍬", dim: "sweetness", val: 5 },
  not_sweet: { label: "Not sweet enough", icon: "🍬", dim: "sweetness", val: 1 },
  poor_quality: { label: "Stale / poor quality", icon: "🤢", dim: "quality", val: 1 },
  raw: { label: "Undercooked", icon: "🥔", dim: "quality", val: 1 },
  cold: { label: "Served cold", icon: "🥶", dim: "quality", val: 2 },
  oily: { label: "Too oily", icon: "🛢️", dim: "quality", val: 2 },
  tasty: { label: "Tasty / fresh", icon: "😋", dim: "quality", val: 5 },
  dirty: { label: "Dirty / hair / insect", icon: "🪰", dim: "hygiene", val: 1 },
  clean: { label: "Clean", icon: "✨", dim: "hygiene", val: 5 },
  boring: { label: "Same food again", icon: "🔁", dim: "variety", val: 1 },
  small_portion: { label: "Small portion", icon: "🍽", dim: null },
  slow: { label: "Long queue / delay", icon: "⏳", dim: null },
};
const POSITIVE = ["tasty", "clean"];

// Offline Hinglish/English keyword rules. Used when there is no API key, the API fails, or the AI returns nothing usable.
const RULES = [
  ["low_salt", /(less|kam|low|no|needs?)\s+(salt|namak)|under.?salt|namak\s+(kam|nahi)|feeka|pheeka/i],
  [
    "too_salty",
    /salty|namk(ee|i)n|(salt|namak)\s+(was\s+|is\s+|bahut\s+|too\s+)*(high|zyada|much|more)|(zyada|bahut|too much)\s+(salt|namak)/i,
  ],
  ["bland", /bland|tasteless|besvaad|no taste|swad nahi|swaad nahi|pheeka|feeka|fika|no flavor/i],
  ["too_spicy", /spicy|teekh[aei]|tikh[aei]|jhal|too hot|mirchi|chilli|chillies/i],
  ["too_sweet", /(too|very|bahut|zyada)\s+(sweet|meetha)|over.?sweet/i],
  ["not_sweet", /not\s+(so\s+)?sweet|less\s+sweet|kam\s+meetha|meetha\s+kam/i],
  [
    "dirty",
    /\bhair\b|\bbaal\b|insect|keeda|kida|cockroach|makhi|\bflies\b|\bfly\b|dirty|gandi|gandagi|ganda|unhygienic|not\s+clean|\bbug\b/i,
  ],
  ["clean", /(?<!not )(?<!un)\bclean\b|hygienic|saaf|spotless/i],
  ["raw", /\braw\b|undercook|kaccha|kachcha|kacha|half.?cooked|hard\s+roti|kadak/i],
  ["cold", /\bcold\b|thand(a|i|e)\b|chilled|not\s+hot|garam\s+nahi/i],
  ["oily", /\boily\b|oil|zyada tel|\btel\b|greasy/i],
  ["poor_quality", /stale|basi|baasi|smell|rotten|\bsada\b|bad quality|kharab|bekar|worst|bakwas|ghatiya|burnt|jal\s*gaya/i],
  ["tasty", /tasty|delicious|yummy|\bmast\b|lajawab|amazing|great|awesome|badhiya|\bbest\b|fresh|swadisht|zabardast|\baccha\b|\bachha\b|\bacha\b|shandar|gazab|loved\s+it|superb/i],
  ["small_portion", /quantity|less food|not enough|portion|kam\s+(food|khana|sabzi|roti|rice|quantity)|khana\s+kam|khatam/i],
  ["slow", /queue|\bline\b|\bwait|\blate\b|delay|\bder\b|slow/i],
  ["boring", /same\s+(again|thing|food|daily|everyday)|repeat|boring|roz\s+wahi|monoton|wahi\s+wahi/i],
];
const NEGATED_PRAISE = /not\s+(so\s+)?(tasty|good|fresh|great|nice)|(tasty|mast|badhiya|acha|accha|swad)\s+nahi/i;

function detect(text = "") {
  const found = new Set(RULES.filter(([, re]) => re.test(text)).map(([code]) => code));
  if (NEGATED_PRAISE.test(text)) {
    found.delete("tasty");
    found.add("poor_quality");
  }
  if (found.has("dirty")) found.delete("clean");
  return [...found].slice(0, 6);
}

function guessVerdict(tags, text = "") {
  if (!tags.length)
    return /worst|bekar|kharab|\bbad\b|bakwas|ghatiya|disgusting|pathetic/i.test(text)
      ? "bad"
      : /\bgood\b|badhiya|\baccha\b|\bachha\b|\bacha\b|shandar|gazab|superb|loved/i.test(text)
        ? "good"
        : /\bok(ay)?\b|theek|thik|average|so-?so|normal/i.test(text)
          ? "average"
          : null;
  const pos = tags.filter((t) => POSITIVE.includes(t)).length,
    neg = tags.length - pos;
  if (tags.some((t) => t === "dirty" || t === "raw") || (neg >= 2 && !pos)) return "bad";
  return pos > neg ? "good" : "average";
}

// Aliases for matching dishes spoken or typed casually by students
const DISH_ALIASES = {
  "Dal Tadka": /\bdal\b|tadka|\bdaal\b/i,
  "Shahi Paneer": /\bpaneer\b|shahi/i,
  "Jeera Rice": /\bjeera\s+rice\b|\brice\b|\bchawal\b/i,
  "Steamed Rice": /\bsteamed\s+rice\b|\brice\b|\bchawal\b/i,
  "Tawa Roti": /\broti\b|\bphulka\b|\bchapati\b|tawa/i,
  "Chapati": /\bchapati\b|\broti\b|\bphulka\b/i,
  "Mixed Veg": /\bmix(ed)?\s*veg\b|\bsabzi\b|\bsubzi\b|\btarkari\b/i,
  "Rajma": /\brajma\b/i,
  "Kheer": /\bkheer\b|\bpayasam\b|\bdessert\b|\bsweet\b/i,
  "Papad": /\bpapad\b/i,
  "Salad": /\bsalad\b/i,
  "Curd": /\bcurd\b|\bdahi\b|\braita\b/i,
  "Aloo Paratha": /\baloo\b|\bparatha\b|\bparantha\b/i,
  "Idli Sambar": /\bidli\b|\bsambar\b/i,
  "Tea": /\btea\b|\bchai\b/i,
  "Banana": /\bbanana\b|\bkela\b/i,
  "Poha": /\bpoha\b/i,
  "Upma": /\bupma\b/i,
};

function detectDishes(text = "", menuDishes = []) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = new Set();
  for (const dish of menuDishes) {
    if (lower.includes(dish.toLowerCase())) {
      matched.add(dish);
      continue;
    }
    const alias = DISH_ALIASES[dish];
    if (alias && alias.test(text)) {
      matched.add(dish);
    }
  }
  return [...matched];
}

// Accept only what the UI can render: known codes, a valid verdict, dishes that are on today's menu.
function cleanParse(o, dishes = []) {
  if (!o || typeof o !== "object") return null;
  const tags = [...new Set((Array.isArray(o.tags) ? o.tags : []).filter((t) => TAGS[t]))].slice(0, 6);
  const verdict = ["good", "average", "bad"].includes(o.verdict) ? o.verdict : null;
  return { tags, verdict, dishes: (Array.isArray(o.dishes) ? o.dishes : []).filter((d) => dishes.includes(d)).slice(0, 6) };
}

function ratingsFromTags(codes) {
  const acc = {};
  codes.forEach((c) => {
    const t = TAGS[c];
    if (t && t.dim) (acc[t.dim] ||= []).push(t.val);
  });
  return Object.fromEntries(Object.entries(acc).map(([d, v]) => [d, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
}

module.exports = { TAGS, detect, guessVerdict, detectDishes, cleanParse, ratingsFromTags };
