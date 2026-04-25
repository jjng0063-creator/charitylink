import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY_BYTES = Number(process.env.CATEGORIZE_MAX_BODY_BYTES || 900_000);
const WINDOW_MS = Number(process.env.CATEGORIZE_RATE_WINDOW_MS || 10 * 60 * 1000);
const MAX_REQUESTS_PER_WINDOW = Number(process.env.CATEGORIZE_RATE_MAX || 30);

const ALLOWED_CATEGORIES = ['Clothing', 'Furniture', 'Electronics', 'Food', 'Stationery', 'Other'];
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

const ipRequestWindow = new Map<string, number[]>();

/**
 * Returns a canonical app category from AI text output.
 */
function normalizeCategory(text: string): string {
  const lowered = text.toLowerCase();

  if (lowered.includes('cloth') || lowered.includes('shirt') || lowered.includes('pants')) return 'Clothing';
  if (lowered.includes('furniture') || lowered.includes('chair') || lowered.includes('table')) return 'Furniture';
  if (lowered.includes('electronic') || lowered.includes('phone') || lowered.includes('laptop')) return 'Electronics';
  if (lowered.includes('food') || lowered.includes('snack') || lowered.includes('grocery')) return 'Food';
  if (lowered.includes('stationery') || lowered.includes('book') || lowered.includes('pen')) return 'Stationery';

  return 'Other';
}

/**
 * Writes JSON response with status code.
 */
function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Reads and parses a small JSON body from an incoming HTTP request.
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of req) {
    const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += asBuffer.length;

    if (totalSize > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }

    chunks.push(asBuffer);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body) as Record<string, unknown>;
}

/**
 * Enforces a simple in-memory rate limit per source IP.
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const existing = ipRequestWindow.get(ip) || [];
  const recent = existing.filter((timestamp) => timestamp >= windowStart);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRequestWindow.set(ip, recent);
    return true;
  }

  recent.push(now);
  ipRequestWindow.set(ip, recent);
  return false;
}

/**
 * Calls Gemini server-side and returns a safe category response.
 */
async function handleCategorize(req: IncomingMessage, res: ServerResponse) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    writeJson(res, 429, { error: 'Too many requests. Please try again later.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    writeJson(res, 500, { error: 'Server missing GEMINI_API_KEY.' });
    return;
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = await readJsonBody(req);
  } catch {
    writeJson(res, 400, { error: 'Invalid JSON payload.' });
    return;
  }

  const imageData = typeof parsedBody.imageData === 'string' ? parsedBody.imageData : '';
  const mimeType = typeof parsedBody.mimeType === 'string' ? parsedBody.mimeType : '';

  if (!imageData || !mimeType) {
    writeJson(res, 400, { error: 'Missing imageData or mimeType.' });
    return;
  }

  try {
    let lastApiError = 'Gemini request failed.';

    for (const model of GEMINI_MODELS) {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Identify the primary item in this image and return only one category from this list: ${ALLOWED_CATEGORIES.join(', ')}. Return only the category name.`,
                  },
                  { inlineData: { data: imageData, mimeType } },
                ],
              },
            ],
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        lastApiError = `${model} failed (${geminiResponse.status}): ${errorText}`;
        continue;
      }

      const result = (await geminiResponse.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawText = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ') || '';
      const category = normalizeCategory(rawText);
      writeJson(res, 200, {
        category,
        source: model,
      });
      return;
    }

    console.error('Categorize endpoint Gemini fallback used:', lastApiError);
    // Keep UX stable even if AI is unavailable.
    writeJson(res, 200, {
      category: 'Other',
      warning: 'AI categorization unavailable. Returned fallback category.',
    });
  } catch (error) {
    console.error('Categorize endpoint failed:', error);
    // Keep UX stable even if AI is unavailable.
    writeJson(res, 200, {
      category: 'Other',
      warning: 'Unexpected server error. Returned fallback category.',
    });
  }
}

/**
 * Connect middleware that serves the secure categorization endpoint.
 */
export function categorizeRoute(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method === 'POST' && req.url === '/api/categorize') {
    void handleCategorize(req, res);
    return;
  }

  next();
}
