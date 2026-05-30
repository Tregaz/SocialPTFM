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