import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
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

    // Simple reply logic
    let reply = "👋 Hello! Send 'menu' to see options or say anything to get an echo.";
    if (lower === "menu") {
      reply = "📋 Menu\n- Type anything and I’ll echo it back.\n- Say 'help' for info.";
    } else if (lower === "help") {
      reply = "ℹ️ This is a demo bot. Your messages are echoed back. You can integrate your own logic next.";
    } else if (text) {
      reply = `You said: ${text}`;
    }

    // Send reply via WhatsApp Cloud API
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.error("Missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    } else {
      await axios.post(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
      );
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
