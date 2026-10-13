import { setTimeout as delay } from "node:timers/promises";
import { checkGeneration, generationSignal } from "./generation-cancel";

export async function retryImageGeneration<T>(
  generate: () => Promise<T>,
  wait: () => Promise<void> = async () => {
    await delay(10000, undefined, { signal: generationSignal() });
  },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    checkGeneration();
    try {
      return await generate();
    } catch (error) {
      checkGeneration();
      if (attempt >= 2) throw error;
      console.warn(`Generate gambar gagal; mencoba ulang ${attempt + 1}/2`);
      await wait();
    }
  }
}
