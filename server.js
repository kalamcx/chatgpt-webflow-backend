const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.openai.com/v1",
});

const supabase = createClient(
  process.env.YOUR_SUPABASE_PROJECT_URL,
  process.env.YOUR_SUPABASE_API_KEY
);

const assistantId = process.env.ASSISTANT_ID;

app.use(cors());
app.use(bodyParser.json());

// TEST ROUTE
app.get("/test-supabase", async (req, res) => {
  try {
    const newThreadId = crypto.randomUUID();

    const { data: threadData, error: threadError } = await supabase
      .from("threads")
      .insert({
        id: newThreadId,
        created_at: new Date().toISOString(),
      })
      .select();

    if (threadError) {
      console.error(threadError);
      return res.status(500).json({ error: threadError.message });
    }

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .insert({
        id: crypto.randomUUID(),
        thread_id: newThreadId,
        content: "Test message from /test-supabase",
        role: "user",
        created_at: new Date().toISOString(),
      })
      .select();

    if (messageError) {
      console.error(messageError);
      return res.status(500).json({ error: messageError.message });
    }

    res.json({
      message: "Insert successful!",
      thread: threadData,
      messageData: messageData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create thread
app.get("/create-thread", async (req, res) => {
  try {
    const thread = await openai.beta.threads.create();

    const { error } = await supabase
      .from("threads")
      .insert({
        id: thread.id,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ thread_id: thread.id });
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: error.message });
  }
});

// Ask assistant
app.post("/ask", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const threadId = req.body.thread_id;

    if (!userMessage || !threadId) {
      return res.status(400).json({ error: "Missing message or thread_id" });
    }

    // Add user message to OpenAI thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Save user message to Supabase
    const { error: insertUserError } = await supabase
      .from("messages")
      .insert({
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: "user",
        content: userMessage,
        created_at: new Date().toISOString(),
      })
      .select();

    if (insertUserError) {
      console.error(insertUserError);
      return res.status(500).json({ error: insertUserError.message });
    }

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    } while (runStatus.status !== "completed");

    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find(
      (msg) => msg.role === "assistant"
    );

    let reply =
      lastMessage?.content?.[0]?.text?.value || "No reply from assistant.";

    reply = reply.replace(/【[^】]+】/g, "");

    // Save assistant message
    const { error: insertBotError } = await supabase
      .from("messages")
      .insert({
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: "assistant",
        content: reply,
        created_at: new Date().toISOString(),
      })
      .select();

    if (insertBotError) {
      console.error(insertBotError);
      return res.status(500).json({ error: insertBotError.message });
    }

    res.json({ reply });
  } catch (error) {
    console.error("Error in /ask:", error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve History
app.get("/threads/:threadId/messages", async (req, res) => {
  try {
    const { threadId } = req.params;

    // Fetch all messages for this thread
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      thread_id: threadId,
      messages: data,
    });
  } catch (error) {
    console.error("Error in fetching messages:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
