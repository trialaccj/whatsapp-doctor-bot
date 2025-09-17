import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your-verify-token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Put your permanent token here
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // From Meta dashboard

// ✅ Webhook verification (Meta will call this once)
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

// ✅ Handle incoming messages
app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const messages = changes?.value?.messages;

  if (messages && messages[0]) {
    const from = messages[0].from; // sender’s number
    const msgBody = messages[0].text?.body?.toLowerCase();

    if (msgBody === "menu") {
      await sendListMessage(from);
    } else if (msgBody === "hello") {
      await sendButtonMessage(from);
    } else {
      await sendTextMessage(from, "Type 'menu' for list or 'hello' for buttons 🙂");
    }
  }

  res.sendStatus(200);
});

// ✅ Send plain text
async function sendTextMessage(to, text) {
  return await sendMessage({
    messaging_product: "whatsapp",
    to,
    text: { body: text },
  });
}

// ✅ Send interactive buttons
async function sendButtonMessage(to) {
  return await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Choose an option:" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "yes_btn", title: "✅ Yes" } },
          { type: "reply", reply: { id: "no_btn", title: "❌ No" } },
        ],
      },
    },
  });
}

// ✅ Send interactive list
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

// ✅ Common function to send API request
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
  console.log("Message sent response:", JSON.stringify(data, null, 2));
  return data;
}

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
