const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ASSISTANT_ID = "asst_0tm5DrjM28gJ3d0h1CfQ80ac";

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // Wait until the assistant finishes
    let runStatus;
    while (true) {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      if (runStatus.status === "completed") break;
      if (runStatus.status === "failed") throw new Error("Assistant failed.");
      await new Promise((r) => setTimeout(r, 1000));
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const replyMessage = messages.data.find((m) => m.role === "assistant");
    const replyText = replyMessage?.content?.[0]?.text?.value;

    res.json({ reply: replyText || "No response from assistant." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
