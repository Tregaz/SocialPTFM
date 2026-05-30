export async function checkContentSafety(base64Data: string): Promise<boolean> {
  if (!base64Data || base64Data.length < 1000) return false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(true);
        return;
      }

      // Small scale for performance
      canvas.width = 50;
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);

      const imageData = ctx.getImageData(0, 0, 50, 50).data;
      let skinPixels = 0;
      let totalPixels = 50 * 50;
      
      let rSum = 0, gSum = 0, bSum = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];

        rSum += r;
        gSum += g;
        bSum += b;

        // Heuristic skin tone detection
        if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.max(r, g, b) - Math.min(r, g, b) > 15) {
          skinPixels++;
        }
      }

      const rAvg = rSum / totalPixels;
      const gAvg = gSum / totalPixels;
      const bAvg = bSum / totalPixels;

      let varianceSum = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        varianceSum += Math.pow(imageData[i] - rAvg, 2);
        varianceSum += Math.pow(imageData[i + 1] - gAvg, 2);
        varianceSum += Math.pow(imageData[i + 2] - bAvg, 2);
      }
      const variance = varianceSum / (totalPixels * 3);

      // Block if > 50% skin pixels or very low variance (uniform color)
      if (skinPixels / totalPixels > 0.5 || variance < 200) {
        resolve(false);
      } else {
        resolve(true);
      }
    };
    img.onerror = () => resolve(false);
    img.src = base64Data;
  });
}

export function compressToLimit(dataUrl: string, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let quality = 0.7;
      let width = img.width;
      let height = img.height;
      const maxDim = 400;

      const tryCompress = () => {
        let w = width;
        let h = height;
        if (w > maxDim) {
          const ratio = maxDim / w;
          w = maxDim;
          h = Math.round(h * ratio);
        }
        if (h > maxDim) {
          const ratio = maxDim / h;
          h = maxDim;
          w = Math.round(w * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        let result = canvas.toDataURL("image/jpeg", quality);

        if (result.length > maxChars && quality > 0.1) {
          quality = Math.round((quality - 0.1) * 10) / 10;
          tryCompress();
        } else if (result.length > maxChars && w > 60) {
          width = Math.round(w * 0.8);
          height = Math.round(h * 0.8);
          quality = 0.7;
          tryCompress();
        } else {
          resolve(result);
        }
      };

      tryCompress();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}