import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// 🔹 Load environment variables (set these in your .env or Render/Heroku config)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your-verify-token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Permanent token from Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // From Meta WhatsApp App settings

// ============================================================
// ✅ Webhook verification (Meta calls this when you set up URL)
// ============================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// ============================================================
// ✅ Handle incoming messages
// ============================================================
app.post("/webhook", async (req, res) => {
  console.log("📩 Incoming webhook:", JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const messages = changes?.value?.messages;

  if (messages && messages[0]) {
    const from = messages[0].from;

    // Case 1: User typed text
    if (messages[0].text) {
      const msgBody = messages[0].text.body.toLowerCase();

      if (msgBody === "hello") {
        await sendButtonMessage(from);
      } else if (msgBody === "menu") {
        await sendListMessage(from);
      } else {
        await sendTextMessage(from, "👉 Type 'hello' for buttons or 'menu' for a list.");
      }
    }

    // Case 2: User clicked a button
    else if (messages[0].interactive?.type === "button_reply") {
      const buttonId = messages[0].interactive.button_reply.id;
      const buttonTitle = messages[0].interactive.button_reply.title;

      console.log(`🖱️ User clicked button: ${buttonTitle} (ID: ${buttonId})`);

      if (buttonId === "yes_btn") {
        await sendTextMessage(from, "✅ You clicked YES!");
      } else if (buttonId === "no_btn") {
        await sendTextMessage(from, "❌ You clicked NO!");
      }
    }

    // Case 3: User picked from list
    else if (messages[0].interactive?.type === "list_reply") {
      const rowId = messages[0].interactive.list_reply.id;
      const rowTitle = messages[0].interactive.list_reply.title;

      console.log(`📋 User picked: ${rowTitle} (ID: ${rowId})`);
      await sendTextMessage(from, `👍 You selected: ${rowTitle}`);
    }
  }

  res.sendStatus(200);
});

// ============================================================
// ✅ Send plain text message
// ============================================================
async function sendTextMessage(to, text) {
  return await sendMessage({
    messaging_product: "whatsapp",
    to,
    text: { body: text },
  });
}

// ============================================================
// ✅ Send interactive buttons
// ============================================================
async function sendButtonMessage(to) {
  return await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Do you confirm?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "yes_btn", title: "✅ Yes" } },
          { type: "reply", reply: { id: "no_btn", title: "❌ No" } },
        ],
      },
    },
  });
}

// ============================================================
// ✅ Send interactive list
// ============================================================
async function sendListMessage(to) {
  return await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Pick one from the list 👇" },
      action: {
        button: "Options",
        sections: [
          {
            title: "Main Menu",
            rows: [
              { id: "opt1", title: "Option 1", description: "First choice" },
              { id: "opt2", title: "Option 2", description: "Second choice" },
            ],
          },
        ],
      },
    },
  });
}

// ============================================================
// ✅ Common function to send any payload
// ============================================================
async function sendMessage(payload) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("📤 Message API response:", JSON.stringify(data, null, 2));
  return data;
}

// ============================================================
// ✅ Start server
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
