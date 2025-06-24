const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const assistantId = process.env.ASSISTANT_ID;

app.use(cors());
app.use(bodyParser.json());

// Create a new thread (only once per session)
app.get("/create-thread", async (req, res) => {
  try {
    const thread = await openai.beta.threads.create();
    res.json({ thread_id: thread.id });
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

// Send message to assistant using thread
app.post("/ask", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const threadId = req.body.thread_id;

    if (!userMessage || !threadId) {
      return res.status(400).json({ error: "Missing message or thread_id" });
    }

    // Add user message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage
    });

    // Run the assistant on the thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    // Wait for completion
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    } while (runStatus.status !== "completed");

    // Get messages
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find(msg => msg.role === "assistant");

    const reply = lastMessage?.content?.[0]?.text?.value || "No reply from assistant.";
    res.json({ reply });

  } catch (error) {
    console.error("Error in /ask:", error);
    res.status(500).json({ error: "Failed to get assistant response" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
