# 📘 User Manual

> **Guide for the "Utilisateur Lambda"**

Welcome to Kensho! This guide will help you use the application to its full potential, even if you are not a developer.

---

## 1. What is Kensho?

Kensho is a **Personal AI Assistant** that lives in your browser.
-   **Private**: Your data never leaves your computer.
-   **Smart**: It can read documents, do math, and plan tasks.
-   **Resilient**: It works even if you go offline.

---

## 2. Installation

### 2.1. Requirements
**Hardware**:
-   **For Best Experience**: A computer with a dedicated GPU (NVIDIA, AMD, Intel Arc).
-   **Minimum**: 4GB RAM, 2GB disk space.

**Software**:
-   **Operating System**: Windows 10/11, macOS 12+, or Ubuntu 20.04+.
-   **Browser**: Google Chrome 113+ or Microsoft Edge (Chromium-based).
    -   *Why?* These browsers support **WebGPU**, which Kensho uses to detect your GPU's memory.

### 2.2. Running Kensho Locally

#### Option A: From Pre-Built Release (Easiest)
1.  Download the latest release from the [Releases](https://github.com/Palolo875/kensho-1/releases) page.
2.  Extract the ZIP file to a folder (e.g., `C:\Kensho`).
3.  Open the folder and double-click `index.html`.
4.  Your browser will open Kensho automatically.

#### Option B: From Source (For Developers)
1.  **Install Node.js**: Download from [nodejs.org](https://nodejs.org/) (v18 or higher).
2.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Palolo875/kensho-1.git
    cd kensho-1
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Start the Development Server**:
    ```bash
    npm run dev
    ```
5.  **Open Your Browser**: Navigate to `http://localhost:8080`.

### 2.3. First Time Setup
-   **Model Download**: On first launch, Kensho will download a small AI model (~270MB for Gemma-3-270m).
-   **Progress**: You will see a progress bar. This takes ~1-2 minutes on a fast connection.
-   **Caching**: The model is cached. Subsequent launches will be instant.

---

## 3. Features

### 3.1. Chatting with AI
-   Type your message in the box at the bottom.
-   Press **Enter** to send.
-   The AI will stream the answer.
-   **Tip**: You can ask it to "Think step by step" for complex problems.

### 3.2. Analyzing Documents
1.  Click the **Paperclip** icon.
2.  Select a PDF or Text file.
3.  Ask a question like "Summarize this document" or "What is the total cost mentioned on page 3?".
4.  Kensho uses its **Universal Reader** agent to process the file securely.

### 3.3. Managing Projects
-   Click the **Folder** icon in the sidebar.
-   Create a new project (e.g., "Holiday Planning").
-   Add tasks and let the AI help you complete them.

---

## 4. Troubleshooting

### 4.1. "The AI is slow"
-   **Cause**: Your computer might be running on battery or have many apps open.
-   **Fix**: Plug in your charger. Close other heavy tabs.

### 4.2. "Memory Critical Error"
-   **Cause**: The AI model is too big for your graphics card.
-   **Fix**: Kensho will automatically try to switch to a smaller model (e.g., Gemma-270m). Refresh the page if it gets stuck.

### 4.3. "Network Offline"
-   **Cause**: You lost internet connection.
-   **Fix**: Kensho works offline! You can continue chatting. Only downloading *new* models requires internet.

---

*Need technical details? Check the [ARCHITECTURE.md](./ARCHITECTURE.md).*
