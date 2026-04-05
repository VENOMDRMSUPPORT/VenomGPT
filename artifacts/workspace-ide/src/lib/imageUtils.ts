/**
 * imageUtils.ts — Shared image compression utility for the workspace IDE.
 */

const COMPRESS_MAX_DIM = 1280;
const COMPRESS_QUALITY = 0.85;

/**
 * Compress an image file to a JPEG data URL.
 * - Resizes so the longer side is at most 1280 px.
 * - Encodes as JPEG at 85% quality.
 * A typical 1920×1080 PNG screenshot (1–3 MB) becomes ~150–350 KB as base64.
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error(`Could not decode "${file.name}" as an image`));
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > COMPRESS_MAX_DIM || h > COMPRESS_MAX_DIM) {
          if (w >= h) { h = Math.round((h / w) * COMPRESS_MAX_DIM); w = COMPRESS_MAX_DIM; }
          else        { w = Math.round((w / h) * COMPRESS_MAX_DIM); h = COMPRESS_MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', COMPRESS_QUALITY));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
