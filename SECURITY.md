# 🛡️ Security Policy & Architecture

> **Privacy by Design**

Security is a core pillar of Kensho. Because we run local AI models, we have a unique responsibility to protect user data and system integrity.

---

## 1. Security Model

### 1.1. Local-First Privacy
-   **Principle**: Data stays on the device.
-   **Implementation**: No telemetry or data is sent to the cloud unless the user explicitly enables a "Remote" feature (like the Relay Server).

### 1.2. Worker Isolation
-   **Principle**: Agents should not access the main thread or DOM.
-   **Implementation**: All agents run in dedicated **Web Workers**. They communicate only via the `MessageBus`.
-   **Benefit**: Even if an agent is compromised (e.g., by a prompt injection), it cannot steal cookies or access localStorage directly.

---

## 2. Threat Model & Mitigations

### 2.1. Prompt Injection
-   **Threat**: Malicious user input tricks the LLM into doing something bad.
-   **Mitigation**:
    -   **Sandboxing**: The `CalculatorAgent` uses a restricted execution environment.
    -   **Human in the Loop**: Critical actions (like deleting a file) require user confirmation (planned).

### 2.2. XSS (Cross-Site Scripting)
-   **Threat**: An agent outputs malicious HTML/JS.
-   **Mitigation**:
    -   **Sanitization**: All Markdown output is sanitized using `DOMPurify` before rendering.
    -   **CSP**: Content Security Policy headers restrict where scripts can load from.

### 2.3. Resource Exhaustion
-   **Threat**: An agent runs an infinite loop or allocates too much memory.
-   **Mitigation**:
    -   **OrionGuardian**: Monitors agent health and kills unresponsive workers.
    -   **MemoryManager**: Enforces VRAM limits.

---

## 3. Reporting Vulnerabilities

If you find a security vulnerability, please **DO NOT** open a public issue.
Instead, email us at `security@kensho.ai` (placeholder).

We will acknowledge your report within 48 hours and provide a timeline for a fix.

---

*For more architectural details, see [ARCHITECTURE.md](./ARCHITECTURE.md).*
