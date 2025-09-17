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

    // Greetings / reset
    if (!text || ["hi", "hello", "hey", "menu", "help", "start"].includes(lower)) {
      // Show main menu as LIST
      await sendList(
        from,
        "👋 Welcome to City Hospital",
        "Please choose one of the following options:",
        "View Options",
        [
          {
            title: "Main Menu",
            rows: [
              { id: "menu_10", title: "🏥 Hospital Services", description: "View hospital departments" },
              { id: "menu_20", title: "💊 General Medication", description: "Common medicines & usage" },
              { id: "menu_30", title: "🩺 Doctor’s Advice", description: "Get advice for symptoms" },
            ],
          },
        ]
      );
      return res.sendStatus(200);
    }

    // Thank you flow
    if (["thanks", "thank you", "ok", "okay"].includes(lower)) {
      await sendText(from, "😊 You’re welcome! Stay healthy. Send 'menu' anytime if you need more help.");
      return res.sendStatus(200);
    }

    // Emergency
    if (["emergency", "urgent", "help!"].includes(lower)) {
      await sendText(from, "🚑 If this is an emergency (severe bleeding, chest pain, trouble breathing), please seek immediate medical care or call your local emergency number.");
      return res.sendStatus(200);
    }

    // Number dispatcher
    const num = parseInt(lower, 10);
    if (!Number.isNaN(num)) {
      // Hospital Services (10)
      if (num === 10) {
        await sendList(
          from,
          "🏥 Hospital Services",
          "Please choose a department:",
          "Select Service",
          [
            {
              title: "Departments",
              rows: [
                { id: "srv_11", title: "🚨 Emergency Care" },
                { id: "srv_12", title: "❤ Cardiology" },
                { id: "srv_13", title: "👶 Pediatrics" },
                { id: "srv_14", title: "🦴 Orthopedics" },
                { id: "srv_15", title: "🧴 Dermatology" },
                { id: "srv_16", title: "👩 Gynecology" },
                { id: "srv_17", title: "🧠 Neurology" },
                { id: "srv_18", title: "🎗 Oncology" },
              ],
            },
          ]
        );
        return res.sendStatus(200);
      }

      // General Medication (20)
      if (num === 20) {
        await sendList(
          from,
          "💊 General Medication",
          "Select a common medicine to learn about it:",
          "Select Medicine",
          [
            {
              title: "Medicines",
              rows: [
                { id: "med_21", title: "Paracetamol" },
                { id: "med_22", title: "Ibuprofen" },
                { id: "med_23", title: "Antibiotics" },
                { id: "med_24", title: "Antacids" },
              ],
            },
          ]
        );
        return res.sendStatus(200);
      }

      // Doctor’s Advice (30)
      if (num === 30) {
        await sendList(
          from,
          "🩺 Doctor’s Advice",
          "Select a symptom from the list (1–13):",
          "Select Symptom",
          [
            {
              title: "Symptoms",
              rows: MENU.split("\n").map((line, idx) => ({
                id: `sym_${idx + 1}`,
                title: line,
              })),
            },
          ]
        );
        return res.sendStatus(200);
      }

      // Hospital service details (11–18)
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

      // Medicines (21–24)
      if (num === 21) {
        await sendText(from, "💊 PARACETAMOL (Acetaminophen)\nPurpose: Pain relief, fever reduction.\nDosage: Adults 500–1000 mg every 4–6h (max 4000 mg/day). Children 10–15 mg/kg.\nPrecautions: Avoid in liver disease; do not exceed max dose.");
        return res.sendStatus(200);
      }
      if (num === 22) {
        await sendText(from, "💊 IBUPROFEN\nPurpose: Anti-inflammatory, pain relief, fever reduction.\nDosage: Adults 200–400 mg every 4–6h (max 2400 mg/day); with food.\nPrecautions: Avoid ulcers/heart issues; avoid late pregnancy; may irritate stomach.");
        return res.sendStatus(200);
      }
      if (num === 23) {
        await sendText(from, "💊 ANTIBIOTICS\nPurpose: Treat bacterial infections.\nImportant: Prescription required; complete full course.\nPrecautions: Not for viral infections; follow doctor’s directions.");
        return res.sendStatus(200);
      }
      if (num === 24) {
        await sendText(from, "💊 ANTACIDS\nPurpose: Relief from heartburn/acid indigestion.\nDosage: Adults 1–2 tablets as needed (max per label).\nPrecautions: Limit to short-term use; may interact with meds.");
        return res.sendStatus(200);
      }

      // Symptoms (1–13) → send buttons
      if (num >= 1 && num <= 13) {
        const parts = buildAdviceParts(num);
        if (parts) {
          await sendButtons(
            from,
            parts.header,        // header
            parts.body,          // body
            buildAdviceButtons(num) // ✅ buttons
          );
          return res.sendStatus(200);
        }
      }
    }

    // Default fallback
    await sendText(
      from,
      "🤔 I didn’t catch that.\nSend:\n10 for Hospital Services\n20 for General Medication\n30 for Doctor’s Advice\nOr a symptom number 1–13."
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling webhook:", err?.response?.data || err.message || err);
    res.sendStatus(200);
  }
});
