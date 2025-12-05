export class MockGPUEngine {
  private shouldFail = false;
  
  forceFailure(fail: boolean) { this.shouldFail = fail; }

  async *generate(prompt: string): AsyncGenerator<string> {
    if (this.shouldFail) {
      throw new Error("Erreur GPU simulée (ex: OOM, shader invalide)");
    }
    const tokens = `Réponse GPU (rapide) pour: "${prompt}"`.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 10)); // Rapide
      yield token + ' ';
    }
  }
}