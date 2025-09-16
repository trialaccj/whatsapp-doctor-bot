import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "doctor_verify";   // Your verify token
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || ""; // From Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || ""; // From Meta

// Step 1: Verify Webhook with Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Helpers: menu and advice mapping based on the provided images
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
    1: {
      title: "🤒 Fever / 🤕 Headache / 💪 Body ache",
      meds: [
        "Tab. Dolo 650 — up to 2 times/day, as needed (1-0-1)",
      ],
      extra: "🥤 Hydrate, 🛌 rest, and monitor temperature. If >102°F or persists, consult a doctor.",
    },
    2: {
      title: "🚽 Diarrhoea",
      meds: [
        "Tab. Sporolac-DS — up to 3 days, 3 times/day (1-1-1)",
      ],
      extra: "🧃 Oral rehydration; avoid oily/spicy foods.",
    },
    3: {
      title: "🔥 Acidity / Heartburn / Gastritis",
      meds: [
        "Tab. Nexpro-RD / Nexpro-Fast / Gastrorest / Pan-D / Rantac",
        "Liq. Ulgel",
      ],
      extra: "Up to 2×/day as needed. 🍽️ Avoid late heavy meals, caffeine, alcohol.",
    },
    4: {
      title: "🤧 Allergy / Body itching / Cold",
      meds: [
        "Tab. L-Dio-1 — once daily, up to 5 days (0-0-1)",
      ],
      extra: "🌙 If drowsy, take at night. Avoid known allergens.",
    },
    5: {
      title: "🤢 Vomiting / Nausea",
      meds: [
        "Tab. Ondem MD S/L — up to 5 days, twice/day (1-0-1)",
      ],
      extra: "🥤 Small sips of fluids. Seek care if persistent or dehydrated.",
    },
    6: {
      title: "🤧 Cold / Running nose",
      meds: [
        "Tab. Diominic-DCA / Tab. Allegra 120 mg — up to 5 days, twice/day (1-0-1)",
      ],
      extra: "🌫️ Steam inhalation can help.",
    },
    7: {
      title: "😷 Cough",
      meds: [
        "Syrup Corex DX / Liq. Phenergan — 1 tsp, three times/day (1-1-1 TSF)",
      ],
      extra: "☕ Warm fluids, avoid cold air. If >1 week or breathlessness, consult a doctor.",
    },
    8: {
      title: "🩸 Bleeding / Spotting P/V",
      meds: [
        "Tab. Tranexa 500 — for 5 days, twice/day (1-0-1)",
      ],
      extra: "⚠️ If heavy bleeding or pain, seek urgent care.",
    },
    9: {
      title: "🔙 Back pain / 🧠 Muscular pain",
      meds: [
        "Dynapar AQ spray for local application",
        "Tab. Dolo 650 — up to 2 times/day, as needed",
      ],
      extra: "🧘 Gentle stretching and heat as needed.",
    },
    10: {
      title: "🚫 Constipation",
      meds: [
        "Liq. Cremaffin — bedtime dose (per label); example 0-0-4 TSF",
      ],
      extra: "🥤 Hydrate well, add fiber.",
    },
    11: {
      title: "🥴 Weakness / Dizziness",
      meds: [
        "N-Spark sachet / Vital-Z powder / Oras-L drink",
      ],
      extra: "4-4 TSF per instructions; drink 3–4 L water/day unless restricted.",
    },
    12: {
      title: "💊 Vaginal insertion (weekly)",
      meds: [
        "Tablet VH-3 — vaginal, weekly (0-0-1)",
      ],
      extra: "Use as directed; if irritation occurs, consult a doctor.",
    },
    13: {
      title: "🤕 Stomach ache",
      meds: [
        "Tablet Cyclopam — three times/day (1-1-1)",
      ],
      extra: "If severe, associated with fever/vomiting, or persists, consult a doctor.",
    },
  }[key];

  if (!advice) return null;
  const meds = advice.meds.map(m => `• ${m}`).join("\n");
  return `🩺 ${advice.title}\n${meds}\n\nℹ️ ${advice.extra}\n\n🔁 Reply 'menu' to see options again.\n🙏 Reply 'thanks' to end.`;
}

function parseCategory(text) {
  const t = text.trim().toLowerCase();
  // direct number selection
  const numberMatch = t.match(/^(?:option\s*)?(\d{1,2})$/);
  if (numberMatch) {
    const n = parseInt(numberMatch[1], 10);
    if (n >= 1 && n <= 13) return n;
  }
  // keyword mapping
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
    [10, ["constipation", "hard stool", "cremaffin"]],
    [11, ["weakness", "dizziness", "tired", "fatigue", "oras-l", "vital-z", "n-spark"]],
    [12, ["vaginal", "vh-3", "insertion"]],
    [13, ["stomach ache", "abdominal pain", "cramp", "cyclopam", "stomach pain"]],
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
    `📋 Menu:\n` + MENU +
    `\n\n💡 Tip: Send 'menu' anytime to see options again.`
  );
}

// Step 2: Receive and Respond
app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message) {
    const from = message.from;
    const text = message.text?.body?.toLowerCase?.() || "";

    let reply;

    if (!text || ["hi", "hello", "hey", "menu", "help", "start", "hi!", "hello!"].includes(text.trim())) {
      const name = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
      reply = buildMenuGreeting(name);
    } else {
      if (["thanks", "thank you", "ok", "okay"].includes(text.trim())) {
        reply = "😊 You’re welcome! Stay healthy. Send 'menu' anytime if you need more help.";
      } else if (["emergency", "urgent", "help!"].includes(text.trim())) {
        reply = "🚑 If this is an emergency (severe bleeding, chest pain, trouble breathing), please seek immediate medical care or call your local emergency number.";
      } else {
        const cat = parseCategory(text);
        const advice = buildAdviceResponse(cat);
        reply = advice || (
          "🤔 I didn’t catch that. Please reply with a number 1–13 or type 'menu' to see options."
        );
      }
    }

    try {
      await axios.post(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        },
        { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
      );
    } catch (e) {
      console.error("Failed to send message", e?.response?.data || e.message);
    }
  }
  res.sendStatus(200);
});

// Health check for Render
app.get("/", (_req, res) => {
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Doctor bot running on port ${PORT}`));