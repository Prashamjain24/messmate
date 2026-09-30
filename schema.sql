CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK(meal IN('breakfast','lunch','dinner')), dishes TEXT NOT NULL DEFAULT '[]',
  verdict TEXT NOT NULL CHECK(verdict IN('good','average','bad')),
  tags TEXT NOT NULL DEFAULT '[]',
  spice INT, salt INT, sweetness INT, quality INT, hygiene INT, variety INT,
  comment TEXT DEFAULT '', device_id TEXT NOT NULL, ts INTEGER NOT NULL,
  UNIQUE(device_id, meal, date));
CREATE INDEX IF NOT EXISTS idx_fb ON feedback(meal, date);
