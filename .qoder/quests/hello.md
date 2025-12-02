# Guardrails Pipeline Design for Kensho System

## Overview

This document outlines the design for a comprehensive guardrails pipeline for the Kensho AI system. The pipeline follows the architecture: Input → InputFilter → Router → Executor → Fusioner → OutputGuard → Output, with security controls separated between input and output processing.

## Architecture and Flow

### Pipeline Structure
The proposed pipeline implements a layered security approach:
- **Input Processing**: InputFilter handles normalization and initial sanitization
- **Routing**: Router directs requests to appropriate agents
- **Execution**: Executor processes the core AI operations
- **Fusion**: Fusioner combines outputs from multiple agents
- **Output Processing**: OutputGuard applies final redaction and filtering
- **Delivery**: Final sanitized output delivered to user

### Security Control Separation
Security controls are distinctly separated between input and output phases:
- Input controls focus on preventing malicious prompts from entering the system
- Output controls focus on preventing sensitive information from leaving the system

## InputFilter Component

### Normalization Strategy
The InputFilter implements robust preprocessing to prevent common bypass techniques:

#### Core Normalization Functions
| Function | Purpose | Implementation |
|----------|---------|----------------|
| Lowercase Conversion | Prevent case-based obfuscation | Full text conversion to lowercase |
| Unicode Normalization Form Decomposition (NFD) | Standardize character representation | Apply Unicode NFD normalization |
| Diacritic Removal | Eliminate accent-based bypasses | Strip all diacritical marks |
| Non-alphanumeric Filtering | Remove special characters | Eliminate spaces, hyphens, and non-alphanumeric characters |

#### Advanced Character Handling
- Explicit removal of invisible Unicode characters (zero-width joiner, non-joiner, etc.)
- Implementation via targeted regex patterns rather than generic replacements
- Maintains diagnostic capability through selective filtering

### Pattern Matching System

#### Categorized Pattern Detection
Patterns are organized by categories with severity levels:

| Category | Examples | Severity Levels |
|----------|----------|-----------------|
| Prompt Injection | DAN, SIM, hypothetical scenarios | Block/Warn/Log |
| Secret Exfiltration | API key requests, credential harvesting | Block |
| Jailbreak Patterns | Role-playing prompts, authority override | Block/Warn |

#### Dynamic Pattern Management
- Automated false positive/negative detection through test suites
- Incident-driven BLOCKED_PATTERNS adjustment infrastructure
- Monitoring framework for pattern effectiveness metrics

### Moderation Layering
Implementation follows the recommended pattern:
1. Fast, deterministic rule-based filtering (inexpensive)
2. Model-based moderation for nuanced content (covers violence, self-harm, harassment)

> Note: OpenAI moderation API usage requires verification of compliance with terms of service, particularly in multi-provider proxy scenarios.

## OutputGuard Component

### Intelligent Redaction Strategy
Moving beyond simple asterisk masking to semantic replacements:

#### Redaction Types
| Content Type | Replacement Pattern | Example |
|--------------|-------------------|---------|
| API Keys | [API KEY REDACTED] | [API KEY REDACTED] |
| Email Addresses | [EMAIL REDACTED] | [EMAIL REDACTED] |
| Personal Identifiers | [PII REDACTED] | [PII REDACTED] |

### Multi-layered Detection Approach
1. Targeted regex patterns for specific content types (API keys, tokens, passwords)
2. Specialized PII detection libraries (e.g., Presidio equivalent)
3. Contextual LLM analysis for ambiguous cases

### Policy-Based Sanitization
Flexible sanitization policies based on operational context:

| Policy Mode | Application | Redaction Level |
|-------------|-------------|-----------------|
| Development | Internal testing | Minimal |
| Production Strict | Public deployment | Maximum |
| GDPR Anonymization | EU deployments | Comprehensive PII removal |

### Structured Audit Data
Each sanitization operation returns structured metadata:
- Modified content flag
- Count of removed elements
- Detected content types
- Applied policy information

## Audit Logging and Observability

### Core Logging Framework
Centralized AuditLogger with the following attributes:
- Prompt hashing for correlation without storing sensitive content
- Event typing and severity classification
- Integration capability with Sentry/DataDog or similar platforms

### Enhanced Log Metadata
Each log entry includes:
- Request ID for cross-system correlation
- User ID for accountability tracking
- Called model identification
- Policy version for change tracking

### Behavioral Analytics
Automated anomaly detection based on:
- Rate of blocked prompts per user/IP
- Frequency of sanitization events
- Pattern of policy violations

## Rate Limiting Implementation

### Core Rate Limiting
Sliding window rate limiting by User ID:
- Prevents brute force attacks on guardrails
- Reduces DoS risk to kernel components

### Advanced Rate Limiting Features
- IP-based fallback when User ID unavailable
- Variable limits based on user roles (admin vs public)
- Source-based differentiation (trusted backend vs public frontend)

## Implementation Priorities

Based on current threat landscape analysis:

### Urgent Items
1. Robust normalization implementation
2. Context-aware regex patterns
3. Unicode handling improvements

### Important Items
1. Comprehensive audit logging
2. Rate limiting framework
3. Policy management system

### Nice-to-Have Items
1. External moderation model integration (OpenAI, LlamaGuard)
2. Specialized PII detection libraries
3. Presidio-like capabilities

## Conclusion

This design provides a solid foundation for implementing comprehensive guardrails in the Kensho system. The layered approach with separated input/output controls, combined with flexible policy management and strong observability, creates a defense-in-depth security posture suitable for a distributed multi-agent AI system.