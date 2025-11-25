# 📖 Glossary

> **Definitions for the "Utilisateur Lambda"**

A guide to the technical terms used in Kensho.

---

## A

### Agent
A specialized mini-program that does one job well. Kensho is a team of agents working together.
*Example: The "Calculator Agent" is good at math but can't write poetry.*

### API (Application Programming Interface)
A set of rules that allows different software components to talk to each other.

---

## E

### Embedding
A way to translate text into a list of numbers (a vector) so the AI can understand its meaning.
*Used for: Finding similar documents.*

---

### Idempotency
The property where doing the same action multiple times has the same effect as doing it once.
*Example: Clicking "Save" twice should not create two copies.*
*Kensho Implementation: DuplicateDetector ensures messages are processed only once.*

### IndexedDB
A browser database that can store large amounts of structured data.
*Used for: Conversation history and embeddings in Kensho.*

---

### Kernel
The core engine of Kensho. It manages resources like memory and battery to keep the system running smoothly.

---

## L

### LLM (Large Language Model)
A type of AI trained on massive amounts of text. It can generate human-like text.
*Examples: Phi-3, Qwen, Gemma.*

### Local-First
A philosophy where software runs on your own device, not on a remote server. Better for privacy and speed.

---

## M

### MessageBus
The communication system that connects all the agents. Think of it like a group chat for software.

---

## O

### OIE (Orchestrateur Intelligent d'Exécution)
The "Manager" agent. It takes your request, breaks it down into steps, and assigns tasks to other agents.

---

## Q

### Quantization
A technique to make AI models smaller and faster by reducing their precision slightly.
*Example: A "q4f32" model uses 4-bit numbers instead of 16-bit.*

---

## R

### RAG (Retrieval-Augmented Generation)
A technique where the AI looks up information in your documents before answering a question.

---

## V

### VRAM (Video RAM)
The memory on your graphics card. AI models need a lot of this to run fast.

---

## W

### WebGPU
A new technology that allows web browsers to use your graphics card for heavy calculations (like running AI).

### Web Worker
A background thread in the browser. Kensho uses these to run agents so they don't freeze your screen.
