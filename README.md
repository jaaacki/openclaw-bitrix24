# openclaw-bitrix24

Bitrix24 connector plugin for OpenClaw - enables two-way messaging between OpenClaw and Bitrix24 chat.

## Installation

```bash
npm install openclaw-bitrix24
```

## Configuration

Add to your OpenClaw `openclaw.json`:

```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domains": ["yourcompany.bitrix24.com"],
      "webhookSecret": "your-webhook-secret-token",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    }
  }
}
```

## Bitrix24 Setup

### 1. Register Your Bot

1. Go to your Bitrix24: `https://yourcompany.bitrix24.com`
2. Navigate to Intranet → Services → Rest API
3. Create an **Inbound Webhook**:
   - Note the OAuth token
   - Note the webhook URL

### 2. Configure Webhook

The plugin will automatically register the webhook with Bitrix24 once configured.

### 3. Start Messaging

Once configured, you can:

- Send messages to Bitrix24 channels
- Receive messages from Bitrix24
- Use bot commands (`/command`)
- Share files and attachments
- Manage group and direct messages

## Features

- ✅ Two-way messaging (send & receive)
- ✅ File upload/download
- ✅ Bot commands
- ✅ Group & direct messages
- ✅ Multi-domain support
- ✅ Policy controls
- ✅ Rate limiting
- ✅ Error handling & retry

## Usage Examples

### Send Message

```javascript
// Through OpenClaw
await sendMessage({
  channel: 'bitrix24',
  target: 'user@example.com',
  message: 'Hello from OpenClaw!'
});
```

### Receive Message

Messages from Bitrix24 are automatically routed to OpenClaw for processing.

## Troubleshooting

### Webhook Not Receiving Events

- Verify webhook URL is publicly accessible
- Check Bitrix24 webhook logs
- Ensure webhook secret matches configuration

### Rate Limiting

The connector includes conservative rate limiting (1 msg/sec default). Adjust if needed.

### Configuration Issues

Check OpenClaw logs: `openclaw doctor --non-interactive`

## Roadmap

- [ ] Initial release (v0.1.0)
- [ ] File attachments
- [ ] Custom keyboards
- [ ] Mentions parsing
- [ ] Extended logging
- [ ] v1.0.0 stable release

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE) file.

## Links

- [OpenClaw](https://github.com/openclaw/openclaw)
- [Bitrix24 API Docs](https://dev.1c-bitrix.ru/rest_help/)
- [Issues](https://github.com/jaaacki/openclaw-bitrix24/issues)