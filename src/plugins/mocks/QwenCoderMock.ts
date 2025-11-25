export async function qwenCoderMock(prompt: string): Promise<string> {
  await new Promise(res => setTimeout(res, 250));
  
  const codeExamples = [
    `// Code généré par Qwen-Coder (mock)
function solution() {
  console.log("Solution pour: ${prompt.substring(0, 30)}...");
  // Implémentation simulée
  return true;
}`,
    `// Qwen Coder Mock Response
const result = async () => {
  // Analyse de la requête: ${prompt.substring(0, 40)}
  return "Résultat simulé";
};`,
  ];
  
  return codeExamples[Math.floor(Math.random() * codeExamples.length)];
}
