import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// ENV
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || ""; // required to send replies

// Health check (Render)
app.get("/", (_req, res) => res.status(200).send("OK"));

// Webhook Verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("[GET /webhook]", { mode, tokenPresent: Boolean(token), hasChallenge: Boolean(challenge) });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Helper: extract user-visible text from a message (supports text and interactive replies)
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

// ===== Doctor advice menu and helpers =====
const MENU = [
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

function buildAdviceResponse(key) {
  const advice = {
    1: { title: "🤒 Fever / 🤕 Headache / 💪 Body ache", meds: ["Tab. Dolo 650 — up to 2 times/day, as needed (1-0-1)"], extra: "🥤 Hydrate, 🛌 rest, and monitor temperature. If >102°F or persists, consult a doctor." },
    2: { title: "🚽 Diarrhoea", meds: ["Tab. Sporolac-DS — up to 3 days, 3 times/day (1-1-1)"], extra: "🧃 Oral rehydration; avoid oily/spicy foods." },
    3: { title: "🔥 Acidity / Heartburn / Gastritis", meds: ["Tab. Nexpro-RD / Nexpro-Fast / Gastrorest / Pan-D / Rantac", "Liq. Ulgel"], extra: "Up to 2×/day as needed. 🍽️ Avoid late heavy meals, caffeine, alcohol." },
    4: { title: "🤧 Allergy / Body itching / Cold", meds: ["Tab. L-Dio-1 — once daily, up to 5 days (0-0-1)"], extra: "🌙 If drowsy, take at night. Avoid known allergens." },
    5: { title: "🤢 Vomiting / Nausea", meds: ["Tab. Ondem MD S/L — up to 5 days, twice/day (1-0-1)"], extra: "🥤 Small sips of fluids. Seek care if persistent or dehydrated." },
    6: { title: "🤧 Cold / Running nose", meds: ["Tab. Diominic-DCA / Tab. Allegra 120 mg — up to 5 days, twice/day (1-0-1)"], extra: "🌫️ Steam inhalation can help." },
    7: { title: "😷 Cough", meds: ["Syrup Corex DX / Liq. Phenergan — 1 tsp, three times/day (1-1-1 TSF)"], extra: "☕ Warm fluids, avoid cold air. If >1 week or breathlessness, consult a doctor." },
    8: { title: "🩸 Bleeding / Spotting P/V", meds: ["Tab. Tranexa 500 — for 5 days, twice/day (1-0-1)"], extra: "⚠️ If heavy bleeding or pain, seek urgent care." },
    9: { title: "🔙 Back pain / 🧠 Muscular pain", meds: ["Dynapar AQ spray for local application", "Tab. Dolo 650 — up to 2 times/day, as needed"], extra: "🧘 Gentle stretching and heat as needed." },
    10:{ title: "🚫 Constipation", meds: ["Liq. Cremaffin — bedtime dose (per label); example 0-0-4 TSF"], extra: "🥤 Hydrate well, add fiber." },
    11:{ title: "🥴 Weakness / Dizziness", meds: ["N-Spark sachet / Vital-Z powder / Oras-L drink"], extra: "4-4 TSF per instructions; drink 3–4 L water/day unless restricted." },
    12:{ title: "💊 Vaginal insertion (weekly)", meds: ["Tablet VH-3 — vaginal, weekly (0-0-1)"], extra: "Use as directed; if irritation occurs, consult a doctor." },
    13:{ title: "🤕 Stomach ache", meds: ["Tablet Cyclopam — three times/day (1-1-1)"], extra: "If severe or persistent with fever/vomiting, consult a doctor." },
  }[key];
  if (!advice) return null;
  const meds = advice.meds.map(m => `• ${m}`).join("\n");
  return `🩺 ${advice.title}\n${meds}\n\nℹ️ ${advice.extra}\n\n🔁 Reply 'menu' to see options again.\n🙏 Reply 'thanks' to end.`;
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
    `👋 Hello${name ? ` ${name}` : ""}! I'm your doctor bot.\n` +
    `Please reply with a number (1–13) or a keyword like 'fever', 'cough'.\n\n` +
    `📋 Menu:\n` + MENU +
    `\n\n💡 Tip: Send 'menu' anytime to see options again.`
  );
}

// Text-only menus (no buttons)
function buildMainMenuText() {
  return (
    "👋 Welcome to City Hospital\n" +
    "Please choose by sending a number:\n\n" +
    "10) 🏥 Hospital Services\n" +
    "20) 💊 General Medication\n" +
    "30) 🩺 Doctor’s Advice (Symptoms)\n\n" +
    "Tip: Send 'menu' anytime to see this again."
  );
}

function buildHospitalServicesText() {
  return (
    "🏥 Hospital Services\n" +
    "Please reply with a number:\n\n" +
    "11) 🚨 Emergency Care — 24/7 emergency medical services\n" +
    "12) ❤ Cardiology — Heart and cardiovascular care\n" +
    "13) 👶 Pediatrics — Medical care for children\n" +
    "14) 🦴 Orthopedics — Bone and joint treatment\n" +
    "15) 🧴 Dermatology — Skin and hair care\n" +
    "16) 👩 Gynecology — Women's health services\n" +
    "17) 🧠 Neurology — Brain and nervous system care\n" +
    "18) 🎗 Oncology — Cancer treatment and care\n\n" +
    "Send 'menu' to go back."
  );
}

function buildMedicationMenuText() {
  return (
    "💊 General Medication\n" +
    "Please reply with a number:\n\n" +
    "21) Paracetamol\n" +
    "22) Ibuprofen\n" +
    "23) Antibiotics\n" +
    "24) Antacids\n\n" +
    "Send 'menu' to go back."
  );
}

// Build standard buttons for advice categories (acknowledge/back)
function buildAdviceButtons(catId) {
  return [
    { type: "reply", reply: { id: `ack_${catId}`, title: "✅ Acknowledged" } },
    { type: "reply", reply: { id: "back_menu", title: "🔁 Back to Menu" } },
  ];
}

// Build header/body parts for interactive message from existing advice text
function buildAdviceParts(catId) {
  const full = buildAdviceResponse(catId);
  if (!full) return null;
  const [firstLine, ...rest] = full.split("\n");
  const header = firstLine.replace(/^🩺\s*/, "");
  const body = rest.join("\n").trim();
  return { header, body };
}

// --- Low-level WhatsApp send helpers ---
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
  return sendWhatsApp({ messaging_product: "whatsapp", to, text: { body } });
}

async function sendButtons(to, headerText, bodyText, buttons) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: { buttons },
    },
  });
}

async function sendList(to, headerText, bodyText, buttonText, sections) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: { button: buttonText, sections },
    },
  });
}

// Webhook Receiver (POST)
app.post("/webhook", async (req, res) => {
  try {
    console.log("[POST /webhook] incoming:", JSON.stringify(req.body));

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // WhatsApp sends many event types (statuses, template updates, etc.)
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = getIncomingText(message) || "";
    const lower = text.toLowerCase().trim();

    // No interactive buttons/lists usage — number-only flow

    // Doctor advice flow
    let reply;
    if (!text || ["hi", "hello", "hey", "menu", "help", "start", "hi!", "hello!"].includes(lower)) {
      await sendText(from, buildMainMenuText());
      return res.sendStatus(200);
    } else if (["thanks", "thank you", "ok", "okay"].includes(lower)) {
      reply = "😊 You’re welcome! Stay healthy. Send 'menu' anytime if you need more help.";
    } else if (["emergency", "urgent", "help!"].includes(lower)) {
      reply = "🚑 If this is an emergency (severe bleeding, chest pain, trouble breathing), please seek immediate medical care or call your local emergency number.";
    } else {
      // Number-only dispatcher
      const num = parseInt(lower, 10);
      if (!Number.isNaN(num)) {
        // Main menu selections
        if (num === 10) {
          await sendText(from, buildHospitalServicesText());
          return res.sendStatus(200);
        }
        if (num === 20) {
          await sendText(from, buildMedicationMenuText());
          return res.sendStatus(200);
        }
        if (num === 30) {
          await sendText(from, `🩺 Doctor’s Advice (Symptoms)\nPlease choose 1–13 from the list:\n\n${MENU}\n\nSend 'menu' to go back.`);
          return res.sendStatus(200);
        }
        // Hospital services details
        const services = {
          11: "🚨 Emergency Care — 24/7 emergency medical services.",
          12: "❤ Cardiology — Heart and cardiovascular care.",
          13: "👶 Pediatrics — Medical care for children.",
          14: "🦴 Orthopedics — Bone and joint treatment.",
          15: "🧴 Dermatology — Skin and hair care.",
          16: "👩 Gynecology — Women's health services.",
          17: "🧠 Neurology — Brain and nervous system care.",
          18: "🎗 Oncology — Cancer treatment and care.",
        };
        if (services[num]) {
          await sendText(from, `🏥 Service Info\n${services[num]}\n\nSend 'menu' to go back.`);
          return res.sendStatus(200);
        }
        // Medication choices
        if (num === 21) {
          await sendText(from, "💊 PARACETAMOL (Acetaminophen)\nPurpose: Pain relief, fever reduction.\nDosage: Adults 500–1000 mg every 4–6h (max 4000 mg/day). Children 10–15 mg/kg.\nPrecautions: Avoid in liver disease; do not exceed max dose; avoid duplicates.");
          return res.sendStatus(200);
        }
        if (num === 22) {
          await sendText(from, "💊 IBUPROFEN\nPurpose: Anti-inflammatory, pain relief, fever reduction.\nDosage: Adults 200–400 mg every 4–6h (max 2400 mg/day); with food.\nPrecautions: Avoid ulcers/heart issues; avoid in late pregnancy; may irritate stomach.");
          return res.sendStatus(200);
        }
        if (num === 23) {
          await sendText(from, "💊 ANTIBIOTICS\nPurpose: Treat bacterial infections.\nImportant: Prescription required; complete full course; do not share.\nPrecautions: Not for viral infections; report allergies; follow doctor’s directions.");
          return res.sendStatus(200);
        }
        if (num === 24) {
          await sendText(from, "💊 ANTACIDS\nPurpose: Relief from heartburn/acid indigestion.\nDosage: Adults 1–2 tablets as needed (max per label).\nPrecautions: Limit to short-term use; avoid in kidney disease unless advised; may interact with meds.");
          return res.sendStatus(200);
        }
        // Symptoms (1–13)
        if (num >= 1 && num <= 13) {
          const parts = buildAdviceParts(num);
          if (parts) {
            await sendText(from, `${parts.header}\n${parts.body}\n\nSend 'menu' to go back.`);
            return res.sendStatus(200);
          }
        }
      }
      reply = "🤔 I didn’t catch that. Send 10 for Hospital Services, 20 for General Medication, 30 for Doctor’s Advice, or a symptom number 1–13.";
    }

    // Send reply via WhatsApp Cloud API (only if we didn't already send interactive)
    if (reply && (!ACCESS_TOKEN || !PHONE_NUMBER_ID)) {
      console.error("Missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    }
    if (reply && ACCESS_TOKEN && PHONE_NUMBER_ID) {
      const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      };
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

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling webhook:", err?.response?.data || err.message || err);
    res.sendStatus(200); // always 200 to avoid webhook retries storm while you debug
  }
});

// Start server (Render provides PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
