import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// ENV (placeholders fall back to empty strings if not provided)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";

// Health check (Render)
app.get("/", (_req, res) => res.status(200).send("OK"));

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Extract user-visible text from incoming message (supports text and interactive replies)
function getIncomingText(message) {
  const t = message?.text?.body;
  if (typeof t === "string" && t.length > 0) return t;

  if (message?.type === "interactive" && message.interactive) {
    const i = message.interactive;
    if (i.list_reply?.title) return i.list_reply.title;
    if (i.button_reply?.title) return i.button_reply.title;
  }

  if (message?.button?.text) return message.button.text;
  return "";
}

// Low-level senders
async function sendWhatsApp(payload) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.error("Missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    return;
  }
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    console.error("Send error:", data);
  }
}

async function sendText(to, body) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    text: { body },
  });
}

async function sendButtons(to, headerText, bodyText, buttons) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    interactive: {
      type: "button",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: { buttons },
    },
  });
}

// ===== Doctor advice menu and helpers =====
const MENU_TEXT = [
  "1) 🤒 Fever / 🤕 Headache / 💪 Body or limb pain",
  "2) 🚽 Diarrhoea",
  "3) 🔥 Acidity / Heartburn / Gastritis",
  "4) 🤧 Allergy / Body itching / Cold",
  "5) 🤢 Vomiting / Nausea",
  "6) 🤧🤧 Cold / Running nose",
  "7) 😷 Cough",
  "8) 🩸 Bleeding / Spotting P/V",
  "9) 🔙 Back pain / 🧠 Muscular pain",
  "10) 🚫 Constipation",
  "11) 🥴 Weakness / Dizziness",
  "12) 💊 Vaginal insertion (weekly)",
  "13) 🤕 Stomach ache",
].join("\n");

function buildAdvice(key) {
  const advice = {
    1: { title: "🤒 Fever / 🤕 Headache / 💪 Body ache", meds: ["Tab. Dolo 650 — up to 2 times/day (1-0-1)"], extra: "Hydrate, rest, monitor temperature. If >102°F or persists, consult a doctor." },
    2: { title: "🚽 Diarrhoea", meds: ["Tab. Sporolac-DS — up to 3 days, 3 times/day (1-1-1)"], extra: "Oral rehydration; avoid oily/spicy foods." },
    3: { title: "🔥 Acidity / Heartburn / Gastritis", meds: ["Tab. Nexpro-RD / Nexpro-Fast / Gastrorest / Pan-D / Rantac", "Liq. Ulgel"], extra: "Up to 2×/day as needed. Avoid late heavy meals, caffeine, alcohol." },
    4: { title: "🤧 Allergy / Body itching / Cold", meds: ["Tab. L-Dio-1 — once daily, up to 5 days (0-0-1)"], extra: "If drowsy, take at night. Avoid known allergens." },
    5: { title: "🤢 Vomiting / Nausea", meds: ["Tab. Ondem MD S/L — up to 5 days, twice/day (1-0-1)"], extra: "Small sips of fluids. Seek care if persistent or dehydrated." },
    6: { title: "🤧 Cold / Running nose", meds: ["Tab. Diominic-DCA / Tab. Allegra 120 mg — up to 5 days, twice/day (1-0-1)"], extra: "Steam inhalation can help." },
    7: { title: "😷 Cough", meds: ["Syrup Corex DX / Liq. Phenergan — 1 tsp, three times/day (1-1-1 TSF)"], extra: "Warm fluids, avoid cold air. If >1 week or breathlessness, consult a doctor." },
    8: { title: "🩸 Bleeding / Spotting P/V", meds: ["Tab. Tranexa 500 — for 5 days, twice/day (1-0-1)"], extra: "If heavy bleeding or pain, seek urgent care." },
    9: { title: "🔙 Back pain / 🧠 Muscular pain", meds: ["Dynapar AQ spray for local application", "Tab. Dolo 650 — up to 2 times/day, as needed"], extra: "Gentle stretching and heat as needed." },
    10:{ title: "🚫 Constipation", meds: ["Liq. Cremaffin — bedtime dose (per label); example 0-0-4 TSF"], extra: "Hydrate well; add fiber." },
    11:{ title: "🥴 Weakness / Dizziness", meds: ["N-Spark sachet / Vital-Z powder / Oras-L drink"], extra: "4-4 TSF per instructions; drink 3–4 L water/day unless restricted." },
    12:{ title: "💊 Vaginal insertion (weekly)", meds: ["Tablet VH-3 — vaginal, weekly (0-0-1)"], extra: "Use as directed; if irritation occurs, consult a doctor." },
    13:{ title: "🤕 Stomach ache", meds: ["Tablet Cyclopam — three times/day (1-1-1)"], extra: "If severe or persistent with fever/vomiting, consult a doctor." },
  }[key];
  if (!advice) return null;
  const meds = advice.meds.map(m => `• ${m}`).join("\n");
  return {
    header: `🩺 ${advice.title}`,
    body: `${meds}\n\nℹ️ ${advice.extra}`,
  };
}

function parseCategory(text) {
  const t = text.trim().toLowerCase();
  const numberMatch = t.match(/^(?:option\s*)?(\d{1,2})$/);
  if (numberMatch) {
    const n = parseInt(numberMatch[1], 10);
    if (n >= 1 && n <= 13) return n;
  }
  const map = [
    [1, ["fever", "headache", "body ache", "leg pain", "hand pain", "ache", "dolo"]],
    [2, ["diarrhoea", "diarrhea", "loose motion", "loose motions", "sporolac"]],
    [3, ["acidity", "heartburn", "gastritis", "gas", "acid", "rantac", "pan-d", "nexpro", "ulgel"]],
    [4, ["allergy", "itching", "itch", "cold", "l-dio"]],
    [5, ["vomit", "nausea", "ondem"]],
    [6, ["running nose", "runny nose", "cold", "sneezing", "allegra", "diominic"]],
    [7, ["cough", "phlegm", "corex", "phenergan"]],
    [8, ["bleeding", "spotting", "p/v", "pv", "tranexa"]],
    [9, ["back pain", "muscle", "muscular", "sprain", "dynapar", "body pain"]],
    [10,["constipation", "hard stool", "cremaffin"]],
    [11,["weakness", "dizziness", "tired", "fatigue", "oras-l", "vital-z", "n-spark"]],
    [12,["vaginal", "vh-3", "insertion"]],
    [13,["stomach ache", "abdominal pain", "cramp", "cyclopam", "stomach pain"]],
  ];
  for (const [id, keywords] of map) {
    if (keywords.some(k => t.includes(k))) return id;
  }
  return null;
}

function buildMenuGreeting(name) {
  return (
    `👋 Hello${name ? ` ${name}` : ""}! I’m your doctor bot.\n` +
    `Please reply with a number (1–13) or a keyword like 'fever', 'cough'.\n\n` +
    `📋 Menu:\n${MENU_TEXT}\n\n💡 Tip: Send 'menu' anytime to see options again.`
  );
}

// Build standard buttons for advice categories (acknowledge/back)
function buildAdviceButtons(catId) {
  return [
    { type: "reply", reply: { id: `ack_${catId}`, title: "✅ Acknowledged" } },
    { type: "reply", reply: { id: "back_menu", title: "🔁 Back to Menu" } },
  ];
}

// Webhook Receiver (POST)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const textIn = getIncomingText(message) || "";
    const lower = textIn.toLowerCase().trim();

    // Handle button replies by id (ack/back)
    const buttonId =
      message?.interactive?.button_reply?.id ||
      message?.interactive?.list_reply?.id ||
      null;

    if (buttonId) {
      if (buttonId === "back_menu") {
        const name = value?.contacts?.[0]?.profile?.name;
        await sendText(from, buildMenuGreeting(name));
        return res.sendStatus(200);
      }
      if (buttonId.startsWith("ack_")) {
        await sendText(from, "Thank you. Wishing you a speedy recovery. Reply 'menu' to see options again.");
        return res.sendStatus(200);
      }
      // If a button id matches a category number, show advice again with buttons
      const catNum = parseInt(buttonId, 10);
      if (!Number.isNaN(catNum) && catNum >= 1 && catNum <= 13) {
        const advice = buildAdvice(catNum);
        if (advice) {
          await sendButtons(from, advice.header, advice.body, buildAdviceButtons(catNum));
        }
        return res.sendStatus(200);
      }
    }

    // Fallbacks remain in plain text as requested
    if (!lower || ["hi", "hello", "hey", "start", "help", "menu"].includes(lower)) {
      const name = value?.contacts?.[0]?.profile?.name;
      await sendText(from, buildMenuGreeting(name));
      return res.sendStatus(200);
    }
    if (["thanks", "thank you", "ok", "okay"].includes(lower)) {
      await sendText(from, "You’re welcome. Reply 'menu' to see options again.");
      return res.sendStatus(200);
    }
    if (["emergency", "urgent", "help!"].includes(lower)) {
      await sendText(from, "🚑 If this is an emergency (severe bleeding, chest pain, trouble breathing), please seek immediate medical care or call your local emergency number.");
      return res.sendStatus(200);
    }

    // Category detection (number or keyword)
    const cat = parseCategory(lower);
    if (cat) {
      const advice = buildAdvice(cat);
      if (advice) {
        // IMPORTANT PART YOU ASKED TO SEE:
        // REPLACED plain text send (text: { body: reply }) WITH interactive buttons payload
        // Previously (plain text):
        // await sendText(from, `${advice.header}\n${advice.body}\n\nReply 'menu' to see options again.`);
        // Now (interactive buttons):
        await sendButtons(from, advice.header, advice.body, buildAdviceButtons(cat));
        return res.sendStatus(200);
      }
    }

    // If not understood, gently guide back
    await sendText(from, "I didn’t catch that. Please reply with a number 1–13 or type 'menu' to see options.");
    return res.sendStatus(200);
  } catch (err) {
    console.error("Error handling webhook:", err?.response?.data || err.message || err);
    // Still 200 to avoid webhook retries storm while debugging
    return res.sendStatus(200);
  }
});

// Start server (Render provides PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
