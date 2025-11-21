# 📚 Kensho Documentation Index

Welcome to the Kensho documentation hub. This guide helps you find exactly what you need.

## 🚀 Getting Started

**New to Kensho?** Start here:

1. **[Quick Start](./00_QUICK_START.md)** - Setup and first agent (5 min)
2. **[Getting Started Guide](./GETTING_STARTED.md)** - Detailed tutorial (15 min)
3. **[Architecture Overview](./ARCHITECTURE_DETAILED.md)** - How everything works

---

## 📖 Core Guides

### Development
- **[Agent Development Guide](./AGENT_DEVELOPMENT.md)** - Create agents from scratch
- **[API Reference](./API_REFERENCE.md)** - MessageBus, AgentRuntime, etc.
- **[Communication Patterns](./COMMUNICATION_PATTERNS.md)** - RPC, Streaming, Pub/Sub

### Advanced Topics
- **[Transport Layer](./TRANSPORT.md)** - BroadcastChannel, WebSocket, Hybrid
- **[Guardian System](./GUARDIAN_SYSTEM.md)** - Leader election, failure detection
- **[Data Persistence](./PERSISTENCE.md)** - IndexedDB storage patterns
- **[Monitoring & Metrics](./MONITORING.md)** - Observatory, telemetry, metrics

### Specialized Agents
- **[CalculatorAgent](./CALCULATOR_AGENT.md)** - Math calculations
- **[MainLLMAgent](./LLM_AGENT.md)** - WebGPU LLM inference
- **[OIEAgent](./OIE_AGENT.md)** - Multi-agent orchestration

---

## 🔧 Operations

### Development
- **[Development Setup](./SETUP.md)** - Environment configuration
- **[Testing Guide](./TESTING.md)** - Unit, E2E, manual tests
- **[Debugging Guide](./DEBUGGING_GUIDE.md)** - Troubleshooting

### Deployment
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment
- **[Performance Optimization](./PERFORMANCE.md)** - Optimization techniques
- **[Security Guide](./SECURITY.md)** - Security best practices

---

## 📚 Reference

### Project Structure
```
kensho/
├── src/
│   ├── agents/              # Autonomous agents
│   ├── components/          # React UI components
│   ├── core/                # Core systems (MessageBus, Guardian, etc.)
│   ├── pages/               # Main application
│   └── stores/              # State management
├── tests/                   # Test suites
├── server/                  # Relay server
├── docs/                    # This documentation
└── vite.config.ts          # Build configuration
```

### Key Files
- **[Configuration Files Guide](./CONFIG.md)** - vite.config.ts, tsconfig.json, etc.
- **[Package.json Explained](./PACKAGE.md)** - Dependencies and scripts
- **[Repository Structure](./REPOSITORY.md)** - Directory organization

---

## 🎓 Tutorials & Examples

- **[Your First Agent](./EXAMPLES_BASIC.md)** - Step-by-step tutorial
- **[Building a Chat App](./EXAMPLES_CHAT.md)** - Chat agent example
- **[Multi-Device Setup](./EXAMPLES_NETWORK.md)** - WebSocket communication
- **[Integration Examples](./EXAMPLES_INTEGRATION.md)** - With external APIs

---

## 📞 Support & Contribution

- **[FAQ](./FAQ.md)** - Frequently asked questions
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues & solutions
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
- **[Roadmap](./ROADMAP.md)** - Future features & improvements

---

## 📋 Quick Reference

### Common Commands
```bash
npm run dev              # Start development server
npm run build           # Production build
npm run build:test-agents    # Build agent bundles
npm run test:e2e        # Run E2E tests
npm run test:calculator # Run CalculatorAgent tests
npm run relay           # Start WebSocket relay server
npm run lint            # Run ESLint
npm run type-check      # TypeScript checking
npm run quality         # Full quality check
```

### Important URLs
- **Local Development**: http://localhost:5000
- **WebSocket Relay**: ws://localhost:8080
- **API Documentation**: See [API_REFERENCE.md](./API_REFERENCE.md)

### Key Concepts
- **Agent**: Autonomous unit running in Web Worker
- **MessageBus**: Central communication hub
- **Transport**: Communication mechanism (BroadcastChannel, WebSocket)
- **Guardian**: Distributed coordination system
- **Streaming**: Progressive data delivery

---

## 🗺️ Documentation Status

| Section | Status | Last Updated |
|---------|--------|--------------|
| Getting Started | ✅ Complete | 2025-11-21 |
| Architecture | ✅ Complete | 2025-11-21 |
| API Reference | ✅ Complete | 2025-11-21 |
| Agent Development | ✅ Complete | 2025-11-21 |
| Security | ✅ Complete | 2025-11-21 |
| Deployment | 🟡 Partial | 2025-11-21 |
| Performance | 🟡 Partial | 2025-11-21 |

---

## 💡 Need Help?

1. **Search** this documentation (Ctrl+F)
2. **Check** [FAQ.md](./FAQ.md) for common questions
3. **Read** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for issues
4. **Review** examples in EXAMPLES_*.md files
5. **Check** the [replit.md](../replit.md) for technical details

---

**Happy coding with Kensho!** 🚀
