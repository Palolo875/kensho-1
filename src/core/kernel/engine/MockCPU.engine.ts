export class MockCPUEngine {
  async *generate(prompt: string): AsyncGenerator<string> {
    const tokens = `Réponse CPU (lent) pour: "${prompt}"`.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 50)); // 5x plus lent
      yield token + ' ';
    }
  }
}