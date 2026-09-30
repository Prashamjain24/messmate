# MessMate: Hostel Mess Feedback in Under 10 Seconds

> Built for **Vibe Coding Event 2026 — Day 2 (30th)**
> **Problem Statement:** Hostel Mess Feedback
> **Target Persona:** Hostel student in the food queue (giving feedback) and the mess manager (reading it)

## Problem & Solution

Mess feedback usually fails in two ways. Long survey forms get skipped by students, and raw WhatsApp complaints are too chaotic and unverified for a manager to act on.

MessMate fixes both ends:

- **Student side:** tap Good / Average / Bad, or say or type one line in Hindi, English or Hinglish (for example *"rajma bahut namkeen tha, roti thandi"*). AI turns it into tags, and the student confirms or edits them in one tap.
- **Manager side:** a PIN-protected dashboard ranks what went wrong, shows what is working, breaks results down by dish, and writes a short AI brief with one concrete fix per problem.

### Constraint Addressed

**Feedback must take under 10 seconds.** The shortest path is two taps: pick a verdict, then Submit. Quick-tags and the one-line box are optional extras. Details are optional, and skipped ratings are stored as empty rather than as a fake "3", so lazy input never distorts the manager's numbers.

## Core AI Architecture

- **Model / Service:** Google Gemini via the REST API. The model list is tried in order and starts with `gemini-2.5-flash-lite` (set by `GEMINI_MODEL`). No SDK is used, only `fetch`.
- **Workflow:**

```
Student types/speaks one line
        │
        ▼
POST /api/parse ── Gemini maps the text to a fixed list of 16 tag codes,
        │          a verdict, and dishes from today's menu
        ▼
Student sees the tags as chips, confirms or edits them (1 tap)
        │
        ▼
POST /api/feedback ── stored in SQLite (one rating per device per meal per day)
        │
        ▼
analysis.js ── satisfaction %, problem ranking, Pearson "what drives
        │      satisfaction", per-dish scores (plain maths, no AI)
        ▼
POST /api/digest ── Gemini receives only these aggregates + up to 40 comments,
        │           writes a 2-sentence summary and one fix per problem
        ▼
verify() ── keeps only problems the maths already found, recomputes every
            number and evidence line from the data, and rejects the digest
            if it misses the real #1 problem
```

- **Error Handling:**
  - **AI unavailable:** with no key, a timeout, bad JSON or a rejected digest, the app falls back to built-in Hinglish keyword rules (student side) and a rule-based digest (manager side). The UI shows which source produced the result (*Gemini AI* or *Hinglish Rules* / *Rule-based*).
  - **Wrong or unclear AI output:** the model can only choose from the fixed tag list and today's menu dishes. Anything else is dropped. Vague or unrelated text gives empty tags and a null verdict. The student sees "Couldn't identify specific tags" and can tap tags manually.
  - **Untrusted text:** student comments are treated as data in both prompts, and instructions inside them are ignored.
  - **Thin data:** a dimension needs at least 3 ratings to be shown and 5 to trigger a problem alert. The manager sees a "too few responses" or "low confidence" notice below 15 responses.
  - **Network errors:** an offline screen on load, and a retry message on submit that keeps the student's answers.

## Prerequisites & Installation

**Prerequisite:** Node.js 18 or newer. Node 22.13+ uses built-in SQLite. On older Node the app automatically falls back to a JSON file, so it still works.

There are **no npm dependencies**, so `npm install` is not needed.

```bash
# 1. Clone repository
git clone <REPO_URL>
cd <DIRECTORY>

# 2. Environment variables (optional — the app runs without a key)
cp .env.example .env
# Then edit .env and set:
# GEMINI_API_KEY=your_key_here     (free key: https://aistudio.google.com)

# 3. Run the server
node server.js

# 4. Run the tests (optional)
node --test
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

| Screen | URL |
| :--- | :--- |
| Student rating | `http://localhost:3000/#/rate` |
| Manager dashboard | `http://localhost:3000/#/manager` (demo PIN **1234**) |

**Notes for judges**

- The first run seeds about 280 demo responses: dinner has salt and hygiene problems, lunch is healthy, breakfast is mixed. Re-seed with `node server.js --reset`.
- **No key?** Everything works using the rule-based fallback. You can also paste a Gemini key in the Manager screen under *Gemini AI Settings* (PIN required).
- On the student screen, the 🎤 button uses the browser's speech recognition (works in Chrome). If unavailable, tap one of the sample Hinglish prompts, which fill the text box and run the same AI parsing.
- After rating, the *Rate Again (Demo Reset)* button lets you test several submissions from one device.
- Optional: set `REQUIRE_CODE=1` in `.env` so students must enter the 4-digit counter code shown on the Manager screen.

## Tech Stack

Node.js (built-in `http`, `node:sqlite`), vanilla JavaScript single-page frontend, Gemini API. Files: `server.js` (API), `tags.js` (tag list, Hinglish rules, output sanitizer), `llm.js` (Gemini client and digest verification), `analysis.js` (scoring), `store.js` (storage), `public/` (UI), `test/` (12 unit tests).

## Known Limitations

- The digest's summary and fix wording is written by the model. Only the numbers, evidence lines and problem list are recomputed from the data.
- Device IDs are generated in the browser, so one-vote-per-device is a light guard, not strong identity. `REQUIRE_CODE=1` adds a physical-presence check.
- The *Rate Again* demo endpoint is for demos and should be removed for real deployment.
- Rule-based Hinglish tagging is keyword-based and can miss negations.

## Participant Info

- **Name:** Prasham Jain
- **College:** TCET
- **Day:** Day 2 (30th), online slot