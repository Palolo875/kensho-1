export async function gemmaMock(prompt: string): Promise<string> {
  await new Promise(res => setTimeout(res, 150));
  
  const responses = [
    "Je comprends votre question. Laissez-moi vous aider avec ça.",
    "C'est une excellente question ! Voici ce que je peux vous dire :",
    "D'après mon analyse, je pense que la meilleure approche serait de...",
    "Permettez-moi de vous expliquer cela en détail.",
  ];
  
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  return `${randomResponse} [Réponse simulée de Gemma 3 270M pour: "${prompt.substring(0, 50)}..."]`;
}
