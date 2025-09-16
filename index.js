import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Env vars
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || ""; // required to send messages

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// Webhook verification (GET)
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

// Helper: extract readable text from incoming WhatsApp message
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

// Webhook receiver (POST)
app.post("/webhook", async (req, res) => {
  try {
    console.log("[POST /webhook] incoming:", JSON.stringify(req.body));

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // Non-message events (statuses, etc.) should still return 200
    if (!message) return res.sendStatus(200);

    const from = message.from; // E.164 without +
    const text = getIncomingText(message).trim();
    const lower = text.toLowerCase();

    let reply = "👋 Hello! Send 'menu' or say anything and I’ll echo it back.";
    if (lower === "menu") {
      reply = "📋 Menu\n- Say anything and I’ll echo it back.\n- Say 'help' for info.";
    } else if (lower === "help") {
      reply = "ℹ️ This is a demo WhatsApp bot using Cloud API on Render.";
    } else if (text) {
      reply = `You said: ${text}`;
    }

    // Send the reply (only if envs are set)
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.error("Missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    } else {
      const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
      const body = {
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
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const code = errData?.error?.code;
        const subcode = errData?.error?.error_subcode;
        console.error("Send error:", JSON.stringify(errData, null, 2));

        // Friendly guidance for common issues
        if (code === 131030 || subcode === 131030) {
          console.error(
            "Recipient not in allowed list (error 131030). Add your phone number in the Meta dashboard (WhatsApp → API Setup → Add recipients)."
          );
        } else if (code === 190) {
          console.error("Invalid/expired ACCESS_TOKEN. Regenerate it and update Render env.");
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling webhook:", err?.response?.data || err.message || err);
    // Always 200 to prevent repeated webhook retries while you debug
    res.sendStatus(200);
  }
});

// Start server (Render sets PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
