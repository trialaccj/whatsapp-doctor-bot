import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "YOUR_VERIFY_TOKEN";
const WHATSAPP_TOKEN = "YOUR_WHATSAPP_TOKEN";
const PHONE_NUMBER_ID = "YOUR_PHONE_NUMBER_ID"; // from Meta

// Send text
async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Send buttons
async function sendButtons(to, header, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        header: { type: "text", text: header },
        action: { buttons }
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Send list
async function sendList(to, header, body, buttonText, sections) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: header },
        body: { text: body },
        footer: { text: "City Hospital" },
        action: { button: buttonText, sections }
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming webhook
app.post("/webhook", async (req, res) => {
  try {
    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = req.body.entry[0].changes[0].value.messages[0];
      const from = message.from;

      // If text message
      if (message.type === "text") {
        const userMsg = message.text.body.toLowerCase();

        if (userMsg.includes("hi") || userMsg.includes("hello")) {
          // Main menu buttons
          const buttons = [
            { type: "reply", reply: { id: "hospital_services", title: "🏥 Services" } },
            { type: "reply", reply: { id: "general_medication", title: "💊 Medication" } },
            { type: "reply", reply: { id: "symptom_checker", title: "🩺 Symptoms" } }
          ];
          await sendButtons(
            from,
            "👋 Welcome to City Hospital",
            "Please choose an option:",
            buttons
          );
        }
      }

      // If button clicked
      if (message.type === "interactive" && message.interactive.button_reply) {
        const id = message.interactive.button_reply.id;

        if (id === "hospital_services") {
          const sections = [{
            title: "Services",
            rows: [
              { id: "svc_emergency", title: "🚨 Emergency", description: "24/7 medical help" },
              { id: "svc_cardiology", title: "❤ Cardiology", description: "Heart care" },
              { id: "svc_pediatrics", title: "👶 Pediatrics", description: "Child care" },
              { id: "svc_orthopedics", title: "🦴 Ortho", description: "Bone & joint" },
              { id: "svc_dermatology", title: "🧴 Skin Care", description: "Dermatology" },
              { id: "svc_gynecology", title: "👩 Gynecology", description: "Women's health" },
              { id: "svc_neurology", title: "🧠 Neurology", description: "Brain care" },
              { id: "svc_oncology", title: "🎗 Oncology", description: "Cancer care" }
            ]
          }];
          await sendList(from, "🏥 Services", "Select a service:", "View", sections);
        }

        if (id === "general_medication") {
          const sections = [{
            title: "Medicines",
            rows: [
              { id: "med_pain", title: "💊 Pain Relief", description: "Common pain meds" },
              { id: "med_cold", title: "🤧 Cold/Flu", description: "Cold & flu meds" },
              { id: "med_allergy", title: "🌼 Allergy", description: "Antihistamines" },
              { id: "med_digest", title: "🥴 Digestive", description: "Stomach meds" }
            ]
          }];
          await sendList(from, "💊 Medication", "Select a medicine type:", "View", sections);
        }

        if (id === "symptom_checker") {
          const sections = [{
            title: "Symptoms",
            rows: [
              { id: "symp_fever", title: "🤒 Fever" },
              { id: "symp_cough", title: "😷 Cough" },
              { id: "symp_headache", title: "🤕 Headache" },
              { id: "symp_fatigue", title: "🥱 Fatigue" },
              { id: "symp_stomach", title: "🤢 Stomach Ache" },
              { id: "symp_backpain", title: "💢 Back Pain" },
              { id: "symp_skin", title: "🧴 Skin Rash" },
              { id: "symp_eye", title: "👁 Eye Pain" },
              { id: "symp_throat", title: "🗣 Sore Throat" },
              { id: "symp_chest", title: "❤️ Chest Pain" },
              { id: "symp_dizzy", title: "💫 Dizziness" },
              { id: "symp_joint", title: "🦵 Joint Pain" },
              { id: "symp_other", title: "❓ Other" }
            ]
          }];
          await sendList(from, "🩺 Symptoms", "Select your symptom:", "Check", sections);
        }
      }

      // If list reply clicked
      if (message.type === "interactive" && message.interactive.list_reply) {
        const id = message.interactive.list_reply.id;
        await sendText(from, `✅ You selected: ${id}`);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(10000, () => {
  console.log("🚀 Server running on port 10000");
});
