/**
 * WoxMail Universal AI Engine
 * Supports: Local Ollama ($0 Free), Gemini API, OpenAI, Anthropic, and smart offline heuristic fallback.
 */

export async function queryAI({ prompt, systemPrompt = 'You are an intelligent email writing assistant for WoxMail.', provider = 'auto' }) {
  const finalApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';

  // 1. Try Local Ollama first if running or requested
  if (provider === 'ollama' || (provider === 'auto' && !finalApiKey)) {
    try {
      const ollamaRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          prompt: `${systemPrompt}\n\n${prompt}`,
          stream: false
        }),
        signal: AbortSignal.timeout(3500)
      });
      if (ollamaRes.ok) {
        const json = await ollamaRes.json();
        if (json.response) return json.response.trim();
      }
    } catch (e) {
      // Ollama not running locally, fallback
    }
  }

  // 2. Try Gemini API
  const geminiKey = process.env.GEMINI_API_KEY;
  if ((provider === 'gemini' || provider === 'auto') && geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
          generationConfig: { maxOutputTokens: 1024 }
        }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch (e) {
      console.warn('Gemini API call failed, falling back:', e.message);
    }
  }

  // 3. Try OpenAI API
  const openaiKey = process.env.OPENAI_API_KEY;
  if ((provider === 'openai' || provider === 'auto') && openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1024
        }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text.trim();
    } catch (e) {
      console.warn('OpenAI API call failed:', e.message);
    }
  }

  // 4. Smart Offline Rule-Based Fallback ($0 Zero-Dependency)
  return generateOfflineFallback(prompt);
}

function generateOfflineFallback(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('summarize') || p.includes('summary')) {
    return '• Overview of key discussion topics and mutual updates.\n• Action items identified with pending follow-ups.';
  }
  if (p.includes('smart replies') || p.includes('reply pills')) {
    return JSON.stringify(['Understood, thank you!', "I'll review and get back to you shortly.", 'Can we schedule a quick call to discuss?']);
  }
  if (p.includes('formal') || p.includes('professional')) {
    return 'Dear Recipient,\n\nThank you for reaching out. I have reviewed your message and will follow up with the required details shortly.\n\nBest regards,\nWoxMail User';
  }
  return 'Thank you for your message. I have received it and will get back to you soon.';
}

export async function summarizeThread(messages = [], options = {}) {
  const formatted = messages.map(m => `From: ${m.from}\nDate: ${m.date}\nContent: ${m.text || m.snippet || ''}`).join('\n---\n');
  const prompt = `Please provide a concise 2-bullet summary and action items for this email thread:\n\n${formatted}`;
  return await queryAI({
    prompt,
    systemPrompt: 'You are an executive email summarizer. Return 2 sharp bullet points summarizing decisions and next steps.',
    ...options
  });
}

export async function adjustTone(text, tone = 'professional', options = {}) {
  const prompt = `Rewrite the following email text in a ${tone} tone. Keep the core intent but refine the language:\n\n"${text}"`;
  return await queryAI({
    prompt,
    systemPrompt: `You are an expert copywriter specializing in ${tone} email communications. Return only the rewritten email body.`,
    ...options
  });
}

export async function generateSmartReplies(emailContent, options = {}) {
  const prompt = `Generate 3 short, distinct 1-sentence quick reply suggestions for this email. Return strictly a JSON array of strings e.g. ["Got it, thanks!", "Let me check and reply soon.", "Let's meet tomorrow."]:\n\n"${emailContent}"`;
  const raw = await queryAI({
    prompt,
    systemPrompt: 'You generate short 1-click email response pills. Return only a valid JSON array of 3 strings.',
    ...options
  });

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (Array.isArray(parsed)) return parsed.slice(0, 4);
  } catch (e) {}

  return ['Understood, thank you!', "I'll follow up shortly.", 'Let’s discuss this on a call.'];
}

export default {
  queryAI,
  summarizeThread,
  adjustTone,
  generateSmartReplies
};
