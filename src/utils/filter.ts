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
