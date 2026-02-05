# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-02-06

### Security
- **Timing-safe comparison**: Webhook secret verification now uses `crypto.timingSafeEqual()` to prevent timing attacks

### Changed
- **Constants extraction**: Moved magic numbers to named constants for better maintainability
  - `DISPATCH_TIMEOUT_MS`, `COMMAND_TIMEOUT_MS`, `BITRIX24_FILE_ID_THRESHOLD`, etc.
- **Module documentation**: Added JSDoc module headers to all source files
- **Import optimization**: Switched to `node:fs/promises` for cleaner async file operations

### Fixed
- **Missing downloadFile method**: Added `downloadFile()` to Bitrix24Client for file attachment handling

### Removed
- **Unused dependency**: Removed `pdf-parse` from dependencies (manual PDF parsing is used instead)
- **Dead code**: Removed unused `inflateAsync` import

## [1.0.1] - 2025-02-05

### Fixed
- **Hang fix**: Added timeout protection to prevent infinite waits during agent dispatch
- **Typing indicator**: Bot now shows "typing..." while processing messages

### Added
- **Attachments support**: Full handling of images, documents, voice messages, and videos
- **Voice transcription**: ASR support with Qwen3-ASR and OpenAI Whisper fallback
- **Slash commands**: Native bot command registration and handling via ONIMCOMMANDADD
- **PDF text extraction**: Basic PDF content extraction for document attachments
- **Image analysis**: Integration with OpenClaw's image analysis tools

## [1.0.0] - 2025-02-03

### Added
- Initial release
- Two-way messaging between OpenClaw and Bitrix24
- Webhook-based inbound message handling
- REST API client with rate limiting
- Multi-account support
- Bot message sending via `imbot.message.add`
- BBCode to Markdown conversion and vice versa
- Health check endpoint
- Channel plugin implementation for OpenClaw
