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
  "1) 🤒 Fever / �� Headache / 💪 Body or limb pain",
  "2) �� Diarrhoea",
  "3) 🔥 Acidity / Heartburn / Gastritis",
  "4) 🤧 Allergy / Body itching / Cold",
  "5) 🤢 Vomiting / Nausea",
  "6) ��🤧 Cold / Running nose",
  "7) 😷 Cough",
  "8) 🩸 Bleeding / Spotting P/V",
  "9) 🔙 Back pain / 🧠 Muscular pain",
  "10) 🚫 Constipation",
  "11) 🥴 Weakness / Dizziness",
  "12) �� Vaginal insertion (weekly)",
  "13) 🤕 Stomach ache",
].join("\n");

function buildAdviceResponse(key) {
  const advice = {
    1: { title: "�� Fever / 🤕 Headache / 💪 Body ache", meds: ["Tab. Dolo 650 — up to 2 times/day, as needed (1-0-1)"], extra: "🥤 Hydrate, 🛌 rest, and monitor temperature. If >102°F or persists, consult a doctor." },
    2: { title: "�� Diarrhoea", meds: ["Tab. Sporolac-DS — up to 3 days, 3 times/day (1-1-1)"], extra: "�� Oral rehydration; avoid oily/spicy foods." },
    3: { title: "🔥 Acidity / Heartburn / Gastritis", meds: ["Tab. Nexpro-RD / Nexpro-Fast / Gastrorest / Pan-D / Rantac", "Liq. Ulgel"], extra: "Up to 2×/day as needed. 🍽️ Avoid late heavy meals, caffeine, alcohol." },
    4: { title: "🤧 Allergy / Body itching / Cold", meds: ["Tab. L-Dio-1 — once daily, up to 5 days (0-0-1)"], extra: "🌙 If drowsy, take at night. Avoid known allergens." },
    5: { title: "�� Vomiting / Nausea", meds: ["Tab. Ondem MD S/L — up to 5 days, twice/day (1-0-1)"], extra: "🥤 Small sips of fluids. Seek care if persistent or dehydrated." },
    6: { title: "�� Cold / Running nose", meds: ["Tab. Diominic-DCA / Tab. Allegra 120 mg — up to 5 days, twice/day (1-0-1)"], extra: "🌫️ Steam inhalation can help." },
    7: { title: "😷 Cough", meds: ["Syrup Corex DX / Liq. Phenergan — 1 tsp, three times/day (1-1-1 TSF)"], extra: "☕ Warm fluids, avoid cold air. If >1 week or breathlessness, consult a doctor." },
    8: { title: "🩸 Bleeding / Spotting P/V", meds: ["Tab. Tranexa 500 — for 5 days, twice/day (1-0-1)"], extra: "⚠️ If heavy bleeding or pain, seek urgent care." },
    9: { title: "🔙 Back pain / 🧠 Muscular pain", meds: ["Dynapar AQ spray for local application", "Tab. Dolo 650 — up to 2 times/day, as needed"], extra: "🧘 Gentle stretching and heat as needed." },
    10:{ title: "🚫 Constipation", meds: ["Liq. Cremaffin — bedtime dose (per label); example 0-0-4 TSF"], extra: "🥤 Hydrate well, add fiber." },
    11:{ title: "🥴 Weakness / Dizziness", meds: ["N-Spark sachet / Vital-Z powder / Oras-L drink"], extra: "4-4 TSF per instructions; drink 3–4 L water/day unless restricted." },
    12:{ title: "💊 Vaginal insertion (weekly)", meds: ["Tablet VH-3 — vaginal, weekly (0-0-1)"], extra: "Use as directed; if irritation occurs, consult a doctor." },
    13:{ title: "�� Stomach ache", meds: ["Tablet Cyclopam — three times/day (1-1-1)"], extra: "If severe or persistent with fever/vomiting, consult a doctor." },
  }[key];
  if (!advice) return null;
  const meds = advice.meds.map(m => `• ${m}`).join("\n");
  return `�� ${advice.title}\n${meds}\n\nℹ️ ${advice.extra}\n\n�� Reply 'menu' to see options again.\n�� Reply 'thanks' to end.`;
}

function parseCategory(text) {
  const t = text.trim().toLowerCase();
  const numberMatch = t.match(/^(?:option\s*)?(\d{1,2})$/);
  if (numberMatch) {
    const n = parseInt(numberMatch[1], 10);
    if (n >= 1 && n <= 13) return n;
  }
  const map = [
    [1, ["fever", "headache", "body ache", "leg pain", "hand pain", "ache", "dolo", "fever_btn", "paracetamol", "paracetamol_btn"]],
    [2, ["diarrhoea", "diarrhea", "loose motion", "loose motions", "sporolac"]],
    [3, ["acidity", "heartburn", "gastritis", "gas", "acid", "rantac", "pan-d", "nexpro", "ulgel"]],
    [4, ["allergy", "itching", "itch", "cold", "l-dio"]],
    [5, ["vomit", "nausea", "ondem"]],
    [6, ["running nose", "runny nose", "cold", "sneezing", "allegra", "diominic"]],
    [7, ["cough", "phlegm", "corex", "phenergan", "cough_btn", "ibuprofen", "ibuprofen_btn"]],
    [8, ["bleeding", "spotting", "p/v", "pv", "tranexa"]],
    [9, ["back pain", "muscle", "muscular", "sprain", "dynapar", "body pain"]],
    [10,["constipation", "hard stool", "cremaffin"]],
    [11,["weakness", "dizziness", "tired", "fatigue", "oras-l", "vital-z", "n-spark"]],
    [12,["vaginal", "vh-3", "insertion"]],
    [13,["stomach ache", "abdominal pain", "cramp", "cyclopam", "stomach pain", "stomach_btn", "antacids", "antacids_btn"]],
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

// Send interactive buttons
async function sendButtons(to, headerText, bodyText, buttons) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    interactive: {
      type: "button",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: { buttons: buttons }
    }
  };
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Send list menu
async function sendList(to, headerText, bodyText, buttonText, sections) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: sections
      }
    }
  };
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

    // Professional Medical Assistant Flow with perfect emojis
    let reply;
    if (!text || ["hi", "hello", "hey", "menu", "help", "start", "hi!", "hello!"].includes(lower)) {
      const name = value?.contacts?.[0]?.profile?.name;
      
      // Send main menu buttons
      if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
        const buttons = [
          { type: "reply", reply: { id: "symptoms_menu", title: "🩺 Symptoms & Advice" }},
          { type: "reply", reply: { id: "hospital_services", title: "🏥 Hospital Services" }},
          { type: "reply", reply: { id: "general_medication", title: "💊 General Medication" }}
        ];
        try {
          await sendButtons(from, `👋 Welcome${name ? ` ${name}` : ""}!`, "I am your professional medical assistant. How may I assist you today? 🚀", buttons);
          return res.sendStatus(200);
        } catch (e) {
          console.error("Button send error:", e);
        }
      }
      reply = `👋 Welcome${name ? ` ${name}` : ""}! I am your professional medical assistant. Please select an option:\n\n🩺 Symptoms & Advice\n�� Hospital Services\n💊 General Medication`;
    } else if (["thanks", "thank you", "ok", "okay"].includes(lower)) {
      reply = "😊 You are welcome! Please feel free to contact me anytime for medical assistance. Have a healthy day! ��";
    } else if (["emergency", "urgent", "help!"].includes(lower)) {
      reply = "🚨 **EMERGENCY ALERT** ��\n\nIf you are experiencing a medical emergency (severe chest pain, difficulty breathing, severe bleeding, or loss of consciousness), please call your local emergency services immediately or go to the nearest emergency room. 🏥";
    } else if (lower === "symptoms menu" || lower === "symptoms_menu") {
      // Send the existing doctor menu as interactive list
      if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
        const sections = [{
          title: "🤒 Common Symptoms",
          rows: [
            { id: "1", title: "🤒 Fever/Headache/Body pain", description: "💊 Dolo 650" },
            { id: "2", title: "🚽 Diarrhoea", description: "💊 Sporolac-DS" },
            { id: "3", title: "🔥 Acidity/Heartburn", description: "💊 Nexpro-RD" },
            { id: "4", title: "�� Allergy/Itching", description: "💊 L-Dio-1" },
            { id: "5", title: "🤢 Vomiting/Nausea", description: "💊 Ondem MD" },
            { id: "6", title: "🤧 Cold/Running nose", description: "💊 Allegra 120" },
            { id: "7", title: "�� Cough", description: "�� Corex DX" },
            { id: "8", title: "🩸 Bleeding/Spotting", description: "💊 Tranexa 500" },
            { id: "9", title: "🔙 Back/Muscle pain", description: "💊 Dynapar spray" },
            { id: "10", title: "🚫 Constipation", description: "💊 Cremaffin" }
          ]
        }, {
          title: "🩺 Other Symptoms",
          rows: [
            { id: "11", title: "🥴 Weakness/Dizziness", description: "💊 N-Spark" },
            { id: "12", title: "💊 Vaginal insertion", description: "💊 VH-3" },
            { id: "13", title: "🤕 Stomach ache", description: "💊 Cyclopam" }
          ]
        }];
        try {
          await sendList(from, "🩺 Symptoms & Advice", "Select your symptom for detailed medical advice: 👆", "View All Symptoms", sections);
          return res.sendStatus(200);
        } catch (e) {
          console.error("List send error:", e);
        }
      }
      reply = buildMenuGreeting(name);
    } else if (lower === "hospital services" || lower === "hospital_services") {
      // Send hospital services list
      if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
        const sections = [{
          title: "🏥 Medical Services",
          rows: [
            { id: "emergency", title: "🚨 Emergency Care", description: "24/7 emergency medical services" },
            { id: "cardiology", title: "❤️ Cardiology", description: "Heart and cardiovascular care" },
            { id: "pediatrics", title: "👶 Pediatrics", description: "Medical care for children" },
            { id: "orthopedics", title: "🦴 Orthopedics", description: "Bone and joint treatment" },
            { id: "dermatology", title: "🧴 Dermatology", description: "Skin and hair care" },
            { id: "gynecology", title: "👩 Gynecology", description: "Women's health services" },
            { id: "neurology", title: "�� Neurology", description: "Brain and nervous system care" },
            { id: "oncology", title: "🎗️ Oncology", description: "Cancer treatment and care" }
          ]
        }];
        try {
          await sendList(from, "🏥 Hospital Services", "Please select a medical service for detailed information: 👆", "View Services", sections);
          return res.sendStatus(200);
        } catch (e) {
          console.error("List send error:", e);
        }
      }
      reply = "🏥 **Hospital Services Available:**\n\n1. 🚨 Emergency Care - 24/7 emergency medical services\n2. ❤️ Cardiology - Heart and cardiovascular care\n3. 👶 Pediatrics - Medical care for children\n4. 🦴 Orthopedics - Bone and joint treatment\n5. �� Dermatology - Skin and hair care\n6. 👩 Gynecology - Women's health services\n7. �� Neurology - Brain and nervous system care\n8. 🎗️ Oncology - Cancer treatment and care\n\nPlease select a service for more detailed information. ��";
    } else if (lower === "general medication" || lower === "general_medication") {
      // Send medication menu
      if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
        const buttons = [
          { type: "reply", reply: { id: "paracetamol", title: "💊 Paracetamol" }},
          { type: "reply", reply: { id: "ibuprofen", title: "💊 Ibuprofen" }},
          { type: "reply", reply: { id: "antibiotics", title: "💊 Antibiotics" }},
          { type: "reply", reply: { id: "antacids", title: "💊 Antacids" }}
        ];
        try {
          await sendButtons(from, "💊 General Medication", "Please select a medication for detailed information: 👆", buttons);
          return res.sendStatus(200);
        } catch (e) {
          console.error("Button send error:", e);
        }
      }
      reply = "💊 **General Medication Information:**\n\nPlease select a medication for detailed information: 👆\n\n• �� Paracetamol\n• �� Ibuprofen\n• 💊 Antibiotics\n• 💊 Antacids";
    } else if (lower === "paracetamol" || lower === "paracetamol_btn") {
      reply = "💊 **PARACETAMOL (Acetaminophen)** 💊\n\n**�� Purpose:** Pain relief and fever reduction\n\n**📏 Dosage:**\n• 👨‍�� Adults: 500-1000mg every 4-6 hours\n• ⚠️ Maximum: 4000mg per day\n• �� Children: 10-15mg per kg body weight\n\n**⚠️ Precautions:**\n• �� Do not exceed recommended dose\n• �� Avoid if you have liver disease\n• �� Do not take with other paracetamol-containing medications\n• 👨‍⚕️ Consult doctor if symptoms persist beyond 3 days";
    } else if (lower === "ibuprofen" || lower === "ibuprofen_btn") {
      reply = "💊 **IBUPROFEN** 💊\n\n**�� Purpose:** Anti-inflammatory, pain relief, fever reduction\n\n**📏 Dosage:**\n• 👨‍💼 Adults: 200-400mg every 4-6 hours\n• ⚠️ Maximum: 2400mg per day\n• 🍽️ Take with food or milk\n\n**⚠️ Precautions:**\n• 🚫 Avoid if you have stomach ulcers or heart problems\n• �� Do not take during pregnancy (3rd trimester)\n• ⚠️ May cause stomach irritation\n• 👨‍⚕️ Consult doctor if symptoms persist beyond 3 days";
    } else if (lower === "antibiotics" || lower === "antibiotics_btn") {
      reply = "�� **ANTIBIOTICS** ��\n\n**🎯 Purpose:** Treatment of bacterial infections\n\n**📋 Important:**\n• 📝 Prescription required\n• ✅ Complete the full course as prescribed\n• 🚫 Do not share with others\n• 👨‍⚕️ Take exactly as directed by your doctor\n\n**⚠️ Precautions:**\n• 🚫 Do not use for viral infections (colds, flu)\n• 🚨 Inform doctor of any allergies\n• 🍽️ Take with or without food as directed\n• 📦 Store properly and check expiration date\n\n**💡 Note:** Always consult a healthcare professional before taking antibiotics. ��‍⚕️";
    } else if (lower === "antacids" || lower === "antacids_btn") {
      reply = "💊 **ANTACIDS** 💊\n\n**🎯 Purpose:** Relief from heartburn, acid indigestion, and stomach upset\n\n**📏 Dosage:**\n• 👨‍💼 Adults: 1-2 tablets as needed\n• ⚠️ Maximum: 8 tablets per day\n• 🕐 Take 1 hour after meals and at bedtime\n\n**⚠️ Precautions:**\n• ⏰ Do not use for more than 2 weeks without consulting doctor\n• 🚫 Avoid if you have kidney disease\n• ⚠️ May interfere with other medications\n• ��‍⚕️ Consult doctor if symptoms worsen or persist\n\n**💡 Note:** If symptoms persist, consult a healthcare professional. ��‍⚕️";
    } else {
      // Keep existing doctor advice logic for numbers and keywords
      const cat = parseCategory(text);
      const advice = buildAdviceResponse(cat);
      reply = advice || "😅 I apologize, but I didn't understand your request. Please select from the available options:\n\n🩺 Symptoms & Advice\n🏥 Hospital Services\n�� General Medication\n\nOr type 'menu' to see the main options again. 🔄";
    }

    // Send reply via WhatsApp Cloud API
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.error("Missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    } else {
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
