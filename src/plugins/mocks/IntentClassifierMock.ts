export async function intentClassifierMock(prompt: string): Promise<string> {
  await new Promise(res => setTimeout(res, 20));
  
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('code') || lowerPrompt.includes('function') || lowerPrompt.includes('typescript') || lowerPrompt.includes('javascript')) {
    return 'CODE';
  }
  
  if (lowerPrompt.includes('math') || lowerPrompt.includes('calculer') || lowerPrompt.includes('équation')) {
    return 'MATH';
  }
  
  return 'DIALOGUE';
}
