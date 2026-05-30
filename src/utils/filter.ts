const BAD_WORDS = [
  "badword1", "badword2", "mierda", "puto", "puta", "cabron", "joder",
  "fuck", "shit", "asshole", "bitch", "cunt", "dick", "pussy",
  "gilipollas", "maricón", "coño", "zorra", "malnacido", "hijo de puta"
];

export function cleanText(text: string): string {
  let cleaned = text;
  BAD_WORDS.forEach((word) => {
    const regex = new RegExp(word, "gi");
    cleaned = cleaned.replace(regex, "***");
  });
  return cleaned;
}

export interface ParsedMessage {
  content: string;
  reportCount: number;
  isHidden: boolean;
}

export function parseMessage(text: string): ParsedMessage {
  if (!text) return { content: "", reportCount: 0, isHidden: false };
  
  if (text.startsWith("HIDDEN:")) {
    return { content: text.replace("HIDDEN:", ""), reportCount: 3, isHidden: true };
  }
  
  const reportMatch = text.match(/^REPORT:(\d)\|/);
  if (reportMatch) {
    const reportCount = parseInt(reportMatch[1], 10);
    return {
      content: text.replace(/^REPORT:\d\|/, ""),
      reportCount,
      isHidden: reportCount >= 3,
    };
  }
  
  return { content: text, reportCount: 0, isHidden: false };
}
