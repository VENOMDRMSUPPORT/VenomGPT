import { Router, type IRouter } from "express";
import { getModelProvider } from "../lib/modelAdapter.js";
import { ProviderNotConfiguredError } from "../lib/modelAdapter.js";

const router: IRouter = Router();

const OPTIMIZE_SYSTEM_PROMPT = `You are a prompt engineering expert. Your sole job is to rewrite the user's raw task description into a clear, specific, and actionable task for an AI coding agent.

Rules:
- Output ONLY the rewritten prompt — no preamble, no explanation, no commentary.
- Make the task description concrete and unambiguous.
- Preserve the user's original intent exactly — do not change what they are asking for.
- Specify the expected outcome or deliverable where the original is vague.
- Add relevant technical context if it is clearly implied by the request.
- Keep it concise: one focused, well-structured task description.
- Do not add generic filler phrases like "Please implement this carefully" or "ensure best practices".`;

router.post("/prompt/optimize", async (req, res) => {
  const { prompt } = req.body as { prompt?: unknown };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "empty_prompt", message: "prompt must be a non-empty string" });
    return;
  }

  const trimmed = prompt.trim();

  let provider;
  try {
    provider = getModelProvider();
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      res.status(503).json({ error: "provider_not_configured", message: "No AI provider configured." });
      return;
    }
    throw err;
  }

  try {
    const result = await provider.chat(
      [
        { role: "system", content: OPTIMIZE_SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
      { taskHint: "fast_chat", maxTokens: 1024, temperature: 0.3 }
    );

    const optimized = result.content.trim();
    if (!optimized) {
      res.status(502).json({ error: "empty_response", message: "LLM returned an empty response." });
      return;
    }

    res.json({ optimized });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "llm_error", message });
  }
});

export default router;
