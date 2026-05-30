export function compressToLimit(dataUrl: string, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let quality = 0.7;
      let width = img.width;
      let height = img.height;
      const maxW = 300;
      const maxH = 400;

      const tryCompress = () => {
        let w = width;
        let h = height;

        // First resize to fit within 300x400 bounds while maintaining aspect ratio
        if (w > maxW || h > maxH) {
          const ratioW = maxW / w;
          const ratioH = maxH / h;
          const ratio = Math.min(ratioW, ratioH);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // Ensure portrait orientation (if landscape, swap dimensions)
        if (w > h) {
          // If the image is wider than tall, force portrait by cropping
          // But for camera captures, we crop in CameraOverlay so just resize
          // and maintain the aspect ratio as-is (portrait is forced in CameraOverlay)
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