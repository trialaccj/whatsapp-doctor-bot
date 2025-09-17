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

    // Handle interactive button/list replies first
    const buttonId = message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id || null;
    if (buttonId) {
      if (buttonId === "back_menu") {
        const name = value?.contacts?.[0]?.profile?.name;
        await sendButtons(
          from,
          `👋 Hello${name ? ` ${name}` : ""}!`,
          "Please choose an option:",
          [
            { type: "reply", reply: { id: "hospital_services", title: "🏥 Hospital Services" } },
            { type: "reply", reply: { id: "general_medication", title: "💊 General Medication" } },
          ]
        );
        return res.sendStatus(200);
      }
      if (buttonId === "hospital_services") {
        const sections = [{
          title: "Medical Services",
          rows: [
            { id: "svc_emergency", title: "🚨 Emergency Care", description: "24/7 emergency medical services" },
            { id: "svc_cardiology", title: "❤️ Cardiology", description: "Heart and cardiovascular care" },
            { id: "svc_pediatrics", title: "👶 Pediatrics", description: "Medical care for children" },
            { id: "svc_orthopedics", title: "🦴 Orthopedics", description: "Bone and joint treatment" },
            { id: "svc_dermatology", title: "🧴 Dermatology", description: "Skin and hair care" },
            { id: "svc_gynecology", title: "👩 Gynecology", description: "Women's health services" },
            { id: "svc_neurology", title: "🧠 Neurology", description: "Brain and nervous system care" },
            { id: "svc_oncology", title: "🎗️ Oncology", description: "Cancer treatment and care" }
          ]
        }];
        await sendList(from, "🏥 Hospital Services", "Please select a medical service for details:", "View Services", sections);
        return res.sendStatus(200);
      }
      if (buttonId === "general_medication") {
        const buttons = [
          { type: "reply", reply: { id: "paracetamol", title: "💊 Paracetamol" } },
          { type: "reply", reply: { id: "ibuprofen", title: "💊 Ibuprofen" } },
          { type: "reply", reply: { id: "antibiotics", title: "💊 Antibiotics" } },
          { type: "reply", reply: { id: "antacids", title: "💊 Antacids" } },
        ];
        await sendButtons(from, "💊 General Medication", "Please select a medication for detailed information:", buttons);
        return res.sendStatus(200);
      }
      if (buttonId.startsWith("ack_")) {
        await sendText(from, "Thank you. Wishing you a speedy recovery. Reply 'menu' to see options again.");
        return res.sendStatus(200);
      }
      // If button id is a category number 1–13, show advice again with buttons
      const catNum = parseInt(buttonId, 10);
      if (!Number.isNaN(catNum) && catNum >= 1 && catNum <= 13) {
        const parts = buildAdviceParts(catNum);
        if (parts) {
          await sendButtons(from, parts.header, parts.body, buildAdviceButtons(catNum));
        }
        return res.sendStatus(200);
      }
    }

    // Doctor advice flow
    let reply;
    if (!text || ["hi", "hello", "hey", "menu", "help", "start", "hi!", "hello!"].includes(lower)) {
      const name = value?.contacts?.[0]?.profile?.name;
      reply = buildMenuGreeting(name);
    } else if (["thanks", "thank you", "ok", "okay"].includes(lower)) {
      reply = "😊 You’re welcome! Stay healthy. Send 'menu' anytime if you need more help.";
    } else if (["emergency", "urgent", "help!"].includes(lower)) {
      reply = "🚑 If this is an emergency (severe bleeding, chest pain, trouble breathing), please seek immediate medical care or call your local emergency number.";
    } else {
      const cat = parseCategory(text);
      const parts = cat ? buildAdviceParts(cat) : null;
      if (parts) {
        // Send interactive buttons for the selected category and exit
        await sendButtons(from, parts.header, parts.body, buildAdviceButtons(cat));
        return res.sendStatus(200);
      }
      reply = "🤔 I didn’t catch that. Please reply with a number 1–13 or type 'menu' to see options.";
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
