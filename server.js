const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID; // Add this to your Render environment

// Root route for testing
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// Chat route
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    console.log("Incoming message:", userMessage);

    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // Wait for the run to complete
    let runStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (runStatus.status !== "completed");

    // Get the assistant’s reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    let reply = "Sorry, I couldn't find a valid response.";

    for (const msg of messages.data) {
      if (msg.role === "assistant" && msg.content[0]?.type === "text") {
        reply = msg.content[0].text.value;
        break;
      }
    }

    console.log("Assistant reply:", reply);
    res.json({ reply });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to get assistant response." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
