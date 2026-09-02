import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { queryAI, summarizeThread, adjustTone, generateSmartReplies } from '../services/aiService.js';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/ai/compose
 * Generate full draft from user prompt/bullet points
 */
router.post('/compose', async (req, res) => {
  try {
    const { prompt, tone = 'professional' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const text = await queryAI({
      prompt: `Write a complete email draft based on these notes: "${prompt}". Tone: ${tone}.`,
      systemPrompt: 'You are an intelligent email composer. Return only the email body ready to send.',
    });

    res.json({ draft: text });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI compose failed.' });
  }
});

/**
 * POST /api/ai/rewrite
 * Rewrite email with specific tone (professional, casual, concise, urgent)
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { text, tone = 'professional' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text to rewrite is required.' });
    }

    const rewritten = await adjustTone(text, tone);
    res.json({ rewritten });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Tone adjustment failed.' });
  }
});

/**
 * POST /api/ai/summarize
 * Summarize an email thread
 */
router.post('/summarize', async (req, res) => {
  try {
    const { messages = [] } = req.body;
    const summary = await summarizeThread(messages);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Thread summarization failed.' });
  }
});

/**
 * POST /api/ai/smart-replies
 * Generate 1-click reply suggestion pills
 */
router.post('/smart-replies', async (req, res) => {
  try {
    const { emailContent = '' } = req.body;
    const replies = await generateSmartReplies(emailContent);
    res.json({ replies });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Smart replies generation failed.' });
  }
});

export default router;
