import { randomInt } from "node:crypto";
import { PNG } from "pngjs";

// Readable uppercase glyphs with the commonly confused letters and digits omitted.
const glyphs = {
  A: [14, 17, 17, 31, 17, 17, 17],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  H: [17, 17, 17, 31, 17, 17, 17],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 25, 21, 19, 19, 17],
  P: [30, 17, 17, 30, 16, 16, 16],
  R: [30, 17, 17, 30, 20, 18, 17],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "9": [14, 17, 17, 15, 1, 2, 12],
} as const;

const alphabet = Object.entries(glyphs);
export const IMAGE_CAPTCHA_LENGTH = 6;
const WIDTH = 234;
const HEIGHT = 58;

function shade(image: PNG, x: number, y: number, value: number) {
  const offset = (y * WIDTH + x) * 4;
  image.data.fill(value, offset, offset + 3);
}

export function renderImageCaptcha() {
  const image = new PNG({ width: WIDTH, height: HEIGHT });
  image.data.fill(255);

  for (let i = 0; i < 480; i++) {
    shade(image, randomInt(WIDTH), randomInt(HEIGHT), randomInt(165, 235));
  }
  for (let i = 0; i < 4; i++) {
    const baseline = randomInt(10, 47);
    const amplitude = randomInt(4, 10);
    const phase = randomInt(63) / 10;
    for (let x = 0; x < WIDTH; x++) {
      shade(image, x, Math.round(baseline + amplitude * Math.sin(x / 27 + phase)), 155);
    }
  }

  let answer = "";
  for (let i = 0; i < IMAGE_CAPTCHA_LENGTH; i++) {
    const glyph = alphabet[randomInt(alphabet.length)];
    if (!glyph) throw new Error("Invalid image CAPTCHA glyph");
    const [character, rows] = glyph;
    answer += character;
    const centerX = 23 + i * 37 + randomInt(-4, 5);
    const centerY = 29 + randomInt(-4, 5);
    const angle = (randomInt(-25, 26) * Math.PI) / 180;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const width = randomInt(4, 6);
    const height = randomInt(4, 6);
    const ink = randomInt(15, 65);
    for (let y = centerY - 22; y <= centerY + 22; y++) {
      for (let x = centerX - 19; x <= centerX + 19; x++) {
        const col = Math.floor(((x - centerX) * cos + (y - centerY) * sin) / width + 2.5);
        const row = Math.floor((-(x - centerX) * sin + (y - centerY) * cos) / height + 3.5);
        if (col >= 0 && col < 5 && (rows[row] ?? 0) & (16 >> col)) shade(image, x, y, ink);
      }
    }
  }

  return { answer, imageBase64: PNG.sync.write(image, { colorType: 0 }).toString("base64") };
}
