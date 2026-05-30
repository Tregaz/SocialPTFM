export {};

declare global {
  interface Window {
    nsfwjs: {
      load: (modelOrConfig?: any) => Promise<NSFWModel>;
    };
    tf: any;
  }

  interface NSFWModel {
    classify: (
      img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData,
      topk?: number
    ) => Promise<NSFWPrediction[]>;
  }

  interface NSFWPrediction {
    className: 'Drawing' | 'Hentai' | 'Neutral' | 'Porn' | 'Sexy';
    probability: number;
  }
}
