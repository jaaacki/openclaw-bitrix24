# Contributing to openclaw-bitrix24

Thank you for your interest in contributing! This document outlines how you can help improve the Bitrix24 connector for OpenClaw.

## Development Setup

### Prerequisites
- Node.js >= 18.0.0
- Git
- OpenClaw >= 2026.1.0 (for testing integration)

### Fork & Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/openclaw-bitrix24.git
   cd openclaw-bitrix24
   ```

### Install Dependencies

```bash
npm install
```

### Project Structure
```
openclaw-bitrix24/
├── src/                  # Source code
│   ├── index.js         # Main entry point
│   ├── connector.js     # OpenClaw connector plugin
│   ├── client.js        # Bitrix24 REST API client
│   └── account.js       # Account management
├── examples/            # Usage examples
├── tests/               # Test files
├── README.md            # User documentation
├── CONTRIBUTING.md      # This file
└── package.json         # npm config
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/connector.test.js
```

## Code Style

Follow these conventions:

- Use ES6+ syntax
- camelCase for variables and functions
- PascalCase for classes
- 2-space indentation
- Add JSDoc comments for public APIs

Example:
```javascript
/**
 * Send a message to Bitrix24
 * @param {Object} options - Message options
 * @param {string} options.userId - Recipient user ID
 * @param {string} options.text - Message text
 * @returns {Promise<Object>} API response
 */
async sendMessage({ userId, text }) { }
```

## Commit Guidelines

Use conventional commits:
```
feat: add file upload support
fix: handle empty webhook payloads
docs: update README with examples
test: add unit tests for rate limiting
refactor: simplify API client error handling
```

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test

3. Commit with meaningful messages

4. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

5. Open a pull request on GitHub with:
   - Clear description of the change
   - Link to any related issues
   - Screenshots if UI changes
   - Test results

## Feature Ideas

Looking for something to work on? Here are some ideas:

- [ ] TypeScript type definitions
- [ ] Unit test coverage
- [ ] Integration tests with mock Bitrix24
- [ ] File upload/download
- [ ] Custom keyboard buttons
- [ ] Mention parsing/notifications
- [ ] Extended logging/debugging
- [ ] Webhook retry logic
- [ ] Enhanced error messages

## Reporting Issues

Found a bug? Have a feature request?

1. Check existing issues first
2. Create a new issue with:
   - Clear title
   - Step-by-step reproduction
   - Expected vs actual behavior
   - Environment (Node version, OpenClaw version)
   - Any relevant logs

## Questions?

- Open an issue for GitHub discussions
- Open Source Code of Conduct
- Reach out to maintainers

Thanks for contributing! 🙌