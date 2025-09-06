const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const sqlite3 = require('sqlite3').verbose();

// =======================
// Setup
// =======================
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.MY_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// SQLite database file
const dbPath = path.join(__dirname, '..', 'data', 'memory.db');
const db = new sqlite3.Database(dbPath);

// =======================
// Database Migration
// =======================
function migrateMemoryTable() {
  db.serialize(() => {
    db.get(`PRAGMA table_info(memory)`, (err) => {
      if (err) {
        console.error("Error checking memory table:", err.message);
        return;
      }

      // Step 1: Rename old table if exists
      db.run(`ALTER TABLE memory RENAME TO memory_old`, (renameErr) => {
        if (renameErr && !renameErr.message.includes("no such table")) {
          console.error("Error renaming memory table:", renameErr.message);
          return;
        }

        // Step 2: Create new table with UNIQUE constraint
        db.run(
          `CREATE TABLE IF NOT EXISTS memory (
            user_id TEXT,
            fact_key TEXT,
            fact_value TEXT,
            UNIQUE(user_id, fact_key)
          )`,
          (createErr) => {
            if (createErr) {
              console.error("Error creating new memory table:", createErr.message);
              return;
            }

            // Step 3: Copy old data
            db.run(
              `INSERT OR IGNORE INTO memory (user_id, fact_key, fact_value)
               SELECT user_id, fact_key, fact_value FROM memory_old`,
              (insertErr) => {
                if (insertErr) {
                  console.error("Error copying data:", insertErr.message);
                }

                // Step 4: Drop old table
                db.run(`DROP TABLE IF EXISTS memory_old`, (dropErr) => {
                  if (dropErr) {
                    console.error("Error dropping old table:", dropErr.message);
                  } else {
                    console.log("✅ Memory table migrated successfully");
                  }
                });
              }
            );
          }
        );
      });
    });
  });
}

// Run migration before creating other tables
migrateMemoryTable();

// Create history table if not exists
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS history (
    user_id TEXT,
    message TEXT,
    reply TEXT,
    tone TEXT,
    time INTEGER
  )`);
});

// =======================
// Utility functions
// =======================

// Save a fact (overwrite if exists)
function saveFact(userId, key, value) {
  db.run(
    `INSERT INTO memory (user_id, fact_key, fact_value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, fact_key) DO UPDATE SET fact_value = excluded.fact_value`,
    [userId, key, value]
  );
}

// Get all facts
function getFacts(userId, callback) {
  db.all(`SELECT fact_key, fact_value FROM memory WHERE user_id = ?`, [userId], (err, rows) => {
    if (err) return callback({});
    const facts = {};
    rows.forEach(r => { facts[r.fact_key] = r.fact_value; });
    callback(facts);
  });
}

// Save history
function saveHistory(userId, message, reply, tone) {
  db.run(`INSERT INTO history (user_id, message, reply, tone, time) VALUES (?, ?, ?, ?, ?)`,
    [userId, message, reply, tone, Date.now()]);
}

// =======================
// Tone detection
// =======================
function detectTone(message) {
  const m = message.toLowerCase();
  if (/(sad|depressed|unhappy|down|not good|worried)/.test(m)) return 'empathetic';
  if (/(joke|roast|funny|lol|haha)/.test(m)) return 'playful';
  return 'neutral';
}

// =======================
// Prompt builder
// =======================
function buildPrompt(userId, message, facts, tone) {
  const persona = "You are a helpful chatbot named 'Riyaz Assistant'. Keep replies concise.";
  const factsText = Object.keys(facts).length
    ? `Known facts about the USER: ${JSON.stringify(facts)}`
    : "No known facts about the user yet.";

  const toneHint =
    tone === 'empathetic'
      ? "Respond with empathy, warm and short."
      : tone === 'playful'
      ? "Respond playful and light-hearted."
      : "Respond neutrally and helpfully.";

  return `${persona}\n${factsText}\n${toneHint}\nUser: ${message}\nAssistant:`;
}

// =======================
// LLM Call (Gemini)
// =======================
async function callLLM(prompt) {
  if (!genAI) {
    // fallback simulation
    let reply = "";
    if (prompt.includes("empathetic")) reply = "I'm sorry you're feeling that way — I hear you. Tell me more, and I'll help.";
    else if (prompt.includes("playful")) reply = "Haha nice! You're on fire — tell me more and I'll roast you gently 😉";
    else reply = "Thanks for telling me. I can help with that — what would you like to try next?";
    return { text: reply, simulated: true };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log("✅ Gemini API called with prompt:", prompt.slice(0, 80) + "...");
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return { text, simulated: false };
  } catch (err) {
    console.error("Gemini error:", err);
    return { text: "Error calling Gemini: " + err.message, simulated: true };
  }
}

// =======================
// Express App
// =======================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Chat route
app.post('/chat', async (req, res) => {
  const { user_id, message } = req.body || {};
  if (!user_id || !message) return res.status(400).json({ error: "Provide user_id and message" });

  getFacts(user_id, async (facts) => {
    // Detect tone
    const tone = detectTone(message);

    // Capture name if user says "my name is X"
    const nameMatch = message.match(/my name is ([A-Za-z ]{1,40})/i);
    if (nameMatch) {
      saveFact(user_id, "name", nameMatch[1].trim());
      facts.name = nameMatch[1].trim();
    }

    // Handle "what is my name" explicitly
    if (/what(('| i)s)? my name\??/i.test(message)) {
      if (facts.name) {
        return res.json({ reply: `Your name is ${facts.name}.`, tone, simulated: true });
      } else {
        return res.json({ reply: "I don't know your name yet. What should I call you?", tone, simulated: true });
      }
    }

    // Build LLM prompt
    const prompt = buildPrompt(user_id, message, facts, tone);

    try {
      const llm = await callLLM(prompt);

      // Save to history
      saveHistory(user_id, message, llm.text, tone);

      res.json({ reply: llm.text, tone, simulated: llm.simulated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "LLM call failed", detail: e.message });
    }
  });
});

// API to view memory facts
app.get('/memory/:user_id', (req, res) => {
  getFacts(req.params.user_id, (facts) => {
    res.json(facts);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log('👉 Open http://localhost:' + PORT + ' in your browser');
});
