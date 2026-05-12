/**
 * Baidu AI Text Translate API helper.
 * Translates text to Chinese if it's not already Chinese.
 */

const BAIDU_APPID = process.env.BAIDU_TRANSLATE_APPID || '20260512002611802';
const BAIDU_API_KEY = process.env.BAIDU_TRANSLATE_API_KEY || '5aUA_d81d365jsh1ts67p5ktg';

/** Detect if text contains significant Chinese characters */
export function isChinese(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  // Consider it Chinese if >20% of non-space chars are Chinese
  if (!chineseChars) return false;
  const nonSpace = text.replace(/\s/g, '').length;
  return chineseChars.length / nonSpace > 0.2;
}

/** Translate text to Chinese using Baidu AI Text Translate API */
export async function translateToChinese(text: string): Promise<string> {
  if (!text || text.length < 5) return text;
  if (isChinese(text)) return text;

  try {
    // Baidu API limit is 6000 chars per request, but we cap at 2000 for speed
    const textToTranslate = text.slice(0, 2000);

    const res = await fetch('https://fanyi-api.baidu.com/ait/api/aiTextTranslate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BAIDU_API_KEY}`,
      },
      body: JSON.stringify({
        appid: BAIDU_APPID,
        from: 'auto',
        to: 'zh',
        q: textToTranslate,
      }),
    });

    const data = await res.json() as {
      trans_result?: Array<{ src: string; dst: string }>;
      error_code?: number;
    };

    if (data.trans_result && data.trans_result.length > 0) {
      // Join ALL translated segments (API splits by newline/sentence)
      return data.trans_result.map(r => r.dst).join('\n');
    }
    return text;
  } catch {
    return text;
  }
}
