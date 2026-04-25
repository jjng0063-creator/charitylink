/**
 * Requests AI category prediction from a backend endpoint.
 * The endpoint must keep the Gemini API key server-side.
 */
export async function categorizeItem(imageData: string, mimeType: string): Promise<string> {
  try {
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageData, mimeType }),
    });

    if (!response.ok) {
      throw new Error(`Categorization failed with status ${response.status}`);
    }

    const data = (await response.json()) as { category?: string };
    return data.category?.trim() || 'Other';
  } catch (error) {
    console.error('AI categorization failed:', error);
    return 'Other';
  }
}
