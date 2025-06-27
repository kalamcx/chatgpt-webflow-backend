const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.openai.com/v1",
});


const assistantId = process.env.ASSISTANT_ID;

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL; // e.g. https://abcxyz.supabase.co
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
const SUPABASE_HEADERS = {
  apikey: SUPABASE_API_KEY,
  Authorization: `Bearer ${SUPABASE_API_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

app.use(cors());
app.use(bodyParser.json());

/**
 * Create a new thread
 */
app.get("/create-thread", async (req, res) => {
  try {
    const thread = await openai.beta.threads.create();

    // Save thread in Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/threads`, {
      method: "POST",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify({
        id: thread.id,
      }),
    });

    res.json({ thread_id: thread.id });
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

/**
 * Handle user message & save to Supabase
 */
app.post("/ask", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const threadId = req.body.thread_id;

    if (!userMessage || !threadId) {
      return res
        .status(400)
        .json({ error: "Missing message or thread_id" });
    }

    // Save user message to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify({
        thread_id: threadId,
        role: "user",
        content: userMessage,
      }),
    });

    // Send message to OpenAI
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // Wait for completion
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(
        threadId,
        run.id
      );
    } while (runStatus.status !== "completed");

    // Get assistant reply
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find(
      (msg) => msg.role === "assistant"
    );

    let reply =
      lastMessage?.content?.[0]?.text?.value ||
      "No reply from assistant.";

    // Clean up citations
    reply = reply.replace(/【[^】]+】/g, "");

    // Save assistant reply to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify({
        thread_id: threadId,
        role: "assistant",
        content: reply,
      }),
    });

    res.json({ reply });
  } catch (error) {
    console.error("Error in /ask:", error);
    res.status(500).json({ error: "Failed to get assistant response" });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
