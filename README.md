# openclaw-bitrix24

Bitrix24 channel plugin for OpenClaw - enables two-way messaging between OpenClaw and Bitrix24 chat.

## Features

- ✅ Two-way messaging (send & receive)
- ✅ Webhook-based message reception
- ✅ Markdown to BBCode conversion (bold, italic, links, code blocks, etc.)
- ✅ Smart URL detection (handles URLs in brackets correctly)
- ✅ **Bot commands** (register, update, unregister via imbot.command API)
- ✅ Bulk command visibility management (showAllCommands, bulkUpdateCommands)
- ✅ Custom command registration on startup
- ✅ File upload/download
- ✅ Group & direct messages
- ✅ Multi-domain support
- ✅ Policy controls
- ✅ Rate limiting
- ✅ Error handling & retry

## Installation

### Prerequisites

- OpenClaw 2026.1.0 or higher
- Node.js 18.0.0 or higher

### From Local Directory

```bash
cd ~/Dev/openclaw-bitrix24
npm install
openclaw plugins install .
```

### From npm (when published)

```bash
openclaw plugins install openclaw-bitrix24
```

## Configuration

Add to your OpenClaw `openclaw.json`:

```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domain": "yourcompany.bitrix24.com",
      "webhookSecret": "your-webhook-secret-token",
      "userId": "1",
      "dmPolicy": "open"
    }
  }
}
```

### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable/disable the plugin |
| `domain` | string | Yes | Your Bitrix24 domain (e.g., `company.bitrix24.com`) |
| `webhookSecret` | string | Yes | Webhook secret token for verification |
| `userId` | string | Yes | Your Bitrix24 bot/user ID |
| `dmPolicy` | string | No | Direct message policy (`open`, `pairing`, `allowlist`) |
| `botId` | string | No | Bot ID for command registration |
| `clientId` | string | No | Application token for bot API calls |
| `webhookUrl` | string | No | Public URL for command webhook (required for commands) |
| `registerCommandsOnStartup` | boolean | No | Auto-register commands on startup |
| `customCommands` | array | No | Array of custom command definitions |

### Multiple Accounts

For multiple Bitrix24 domains:

```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "accounts": {
        "company1": {
          "enabled": true,
          "name": "Company 1",
          "domain": "company1.bitrix24.com",
          "webhookSecret": "secret1",
          "userId": "1"
        },
        "company2": {
          "enabled": true,
          "name": "Company 2",
          "domain": "company2.bitrix24.com",
          "webhookSecret": "secret2",
          "userId": "1"
        }
      }
    }
  }
}
```

### Custom Commands

Register bot commands that users can invoke with `/command`:

```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domain": "yourcompany.bitrix24.com",
      "webhookSecret": "your-secret",
      "userId": "1",
      "botId": "123",
      "clientId": "your-application-token",
      "webhookUrl": "https://your-openclaw-domain.com/chan/bitrix24/webhook",
      "registerCommandsOnStartup": true,
      "customCommands": [
        {
          "command": "help",
          "description": "Show available commands",
          "descriptionDe": "Verfügbare Befehle anzeigen",
          "common": false
        },
        {
          "command": "status",
          "description": "Check system status",
          "params": "[service]",
          "common": true
        }
      ]
    }
  }
}
```

**Note:** The `clientId` (application token) and `webhookUrl` are required for command registration. The `webhookUrl` must be publicly accessible for Bitrix24 to send command events.

#### Command Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `command` | string | Yes | Command name (1-32 lowercase letters/numbers) |
| `description` | string | No | English description (max 100 chars) |
| `descriptionDe` | string | No | German description (required by Bitrix24 API) |
| `params` | string | No | Parameter hint (e.g., `[query]`) |
| `common` | boolean | No | If `true`, works in all chats even where bot isn't present |
| `hidden` | boolean | No | If `true`, command is hidden from command list |

## Command Visibility Management

### Making Existing Commands Visible

If you have registered commands that are currently hidden and you want to make them visible in Bitrix24's `/` command menu, you can use the `showAllCommands()` helper method:

```typescript
import { Bitrix24Client } from 'openclaw-bitrix24/src/client';

async function makeCommandsVisible() {
  const client = new Bitrix24Client({
    domain: 'yourcompany.bitrix24.com',
    webhookSecret: 'your-webhook-secret',
    userId: '1',
    botId: '123',
    log: console,
  });

  // Make all hidden commands visible
  const result = await client.showAllCommands();
  
  console.log(`Total commands: ${result.total}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Already visible: ${result.alreadyVisible}`);
  
  // Result includes detailed info:
  result.commands.forEach(cmd => {
    console.log(`/${cmd.command}: ${cmd.updated ? 'UPDATED' : 'no change'}`);
  });
}
```

### Bulk Updating Multiple Commands

Update multiple commands at once with the same properties:

```typescript
const result = await client.bulkUpdateCommands([1, 2, 3], {
  hidden: false,        // Make visible
  common: true,         // Make global (works in all chats)
  extranetSupport: true // Available to extranet users
});

console.log(`${result.successful} successful, ${result.failed} failed`);
```

### Individual Command Updates

Get details about a specific command and update its properties:

```typescript
// List all commands
const commands = await client.listCommands();
// Returns: [{ ID: 1, COMMAND: 'help', HIDDEN: 'Y', COMMON: 'N', ... }]

// Get specific command details
const cmd = await client.getCommandDetails(1);

// Update a single command
await client.updateCommand(1, { hidden: false });
await client.updateCommand(1, { common: true });
```

### Bitrix24 Command Visibility Fields

| Field | API Value | Description |
|-------|-----------|-------------|
| `hidden` (HIDDEN) | `'Y'` | Command hidden from menu |
| `hidden` (HIDDEN) | `'N'` | Command visible in menu |
| `common` (COMMON) | `'Y'` | Command works globally (in any chat) |
| `common` (COMMON) | `'N'` | Command works only in bot's chats |

## Bitrix24 Setup

### 1. Create a Bot in Bitrix24

#### Option A: Via Interface

1. Go to your Bitrix24: `https://yourcompany.bitrix24.com`
2. Navigate to **Intranet → Services → Bots**
3. Click **"Add Bot"**
4. Fill in bot name, avatar, and description
5. Save - you'll get the bot ID

#### Option B: Via REST API

1. Go to **Intranet → Services → Rest API**
2. Create a **New Inbound Webhook**
3. Select **"Bot"** as the application type
4. Note the **OAuth token** and **webhook URL**

### 2. Configure Your Bot

Use the Bitrix24 REST API to configure your bot:

```bash
curl -X POST "https://yourcompany.bitrix24.com/rest/imbot.bot.add" \
  -H "Content-Type: application/json" \
  -d "{
    'CODE': 'my_bot_code',
    'EVENT_HANDLER': 'https://your-openclaw-domain.com/chan/bitrix24/webhook',
    'EVENT_MESSAGE_ADD': 'Y',
    'EVENT_WELCOME_MESSAGE': 'Y',
    'EVENT_BOT_DELETE': 'Y',
    'OPEN_LINES': 'N'
  }"
```

### 3. Enable Webhook Events

Configure which events your bot should receive:

- `EVENT_MESSAGE_ADD` - Receive new messages
- `EVENT_WELCOME_MESSAGE` - Welcome new users
- `EVENT_BOT_DELETE` - Handle bot deletions
- `OPEN_LINES` - Open lines support (optional)

### 4. Test the Webhook

Once configured, test your webhook with a simple curl:

```bash
curl -X POST "https://your-openclaw-domain.com/chan/bitrix24/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    'event': 'ONIMMESSAGEADD',
    'data': {
      'AUTHOR_ID': '123',
      'MESSAGE': 'Test from Bitrix24',
      'MESSAGE_ID': '456'
    }
  }"
```

You should receive: `{"success":true}`

## Usage

### Send Message

From OpenClaw:

```typescript
await message.send({
  channel: 'bitrix24',
  target: '123', // Bitrix24 user ID
  message: 'Hello from OpenClaw!',
});
```

### Receive Message

Messages from Bitrix24 are automatically routed to OpenClaw and delivered to your configured agents.

### Support Multiple Domains

When using multiple accounts, include the domain in the target:

```typescript
await message.send({
  channel: 'bitrix24',
  target: 'company1.bitrix24.com/123', // domain/userId format
  message: 'Hello to company1!',
});
```

## Webhook URL

The plugin automatically registers the webhook endpoint at:

```
https://{your-gateway-hostname}/chan/bitrix24/webhook
```

For example, if your cloudflared tunnel is configured as `openclaw.noonoon.cc`:

```
https://openclaw.noonoon.cc/chan/bitrix24/webhook
```

### Public Webhook Requirement

Bitrix24 requires a **publicly accessible webhook URL**. If you're running OpenClaw locally:

1. **Cloudflare Tunnel** - Recommended (as shown in the summary)
2. **ngrok** - Temporary testing: `ngrok http 18789`
3. **Port forwarding** - Forward port 18789 on your router

## Troubleshooting

### Webhook Not Receiving Events

**Check gateway is running:**
```bash
openclaw gateway status
```

**Verify webhook URL is publicly accessible:**
```bash
curl -X POST "https://openclaw.noonoon.cc/chan/bitrix24/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{}}'
```

**Check OpenClaw logs:**
```bash
openclaw doctor --non-interactive
```

**Verify Bitrix24 webhook configuration:**
- Check the webhook URL matches exactly
- Verify webhook secret (if configured)
- Ensure "Receive messages" event is enabled

### Rate Limiting

The connector includes conservative rate limiting (1 req/sec default). To adjust:

1. Open `src/client.ts`
2. Modify `this.rateLimit.minWait` (1000 = 1 second)
3. Reinstall the plugin

### Configuration Issues

**Check plugin is installed:**
```bash
openclaw plugins list
```

**Check configuration is valid:**
```bash
cat ~/.openclaw/openclaw.json | jq '.channels.bitrix24'
```

**Restart gateway after config changes:**
```bash
openclaw gateway restart
```

### Message Not Sending

1. Check user ID is correct (must be numeric string, e.g., "123")
2. Verify webhook secret in config matches Bitrix24
3. Check logs with `openclaw doctor --non-interactive`
4. Bot must be added to the conversation in Bitrix24

## Architecture

### Outbound Flow
```
Agent → OpenClaw → Bitrix24Client → Bitrix24 REST API → User
```

### Inbound Flow
```
User → Bitrix24 → Webhook → /chan/bitrix24/webhook → OpenClaw → Agent
```

### Event Types

| Event | Description | Supported |
|-------|-------------|-----------|
| ONIMMESSAGEADD | New message received | ✅ |
| ONIMCOMMANDADD | Bot command received | ✅ |
| ONIMBOTDELETE | Bot deleted | ⚠️ (logged) |
| Other events | Logging/notification | ⚠️ (logged) |

## Development

### Install Dependencies

```bash
npm install
```

### Build TypeScript

```bash
npx tsc
```

### Local Testing

```bash
openclaw plugins install .

# Check logs
tail -f ~/.openclaw/logs/gateway.log

# Test webhook
curl -X POST http://localhost:18789/chan/bitrix24/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"ONIMMESSAGEADD","data":{"AUTHOR_ID":"123","MESSAGE":"test"}}'
```

## Roadmap

- [x] Basic two-way messaging
- [x] Webhook receiver
- [x] Bot command support
- [ ] File attachment upload (multipart)
- [ ] Custom keyboards/buttons
- [ ] Mentions parsing (@username)
- [ ] Thread/conversation support
- [ ] Extended logging
- [ ] v1.0.0 stable release

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE) file.

## Links

- [OpenClaw](https://github.com/openclaw/openclaw)
- [Bitrix24 REST API Docs](https://dev.1c-bitrix.ru/rest_help/)
- [IM Bot API](https://dev.1c-bitrix.ru/rest_help/imapp/bot/)
- [Issues](https://github.com/jaaacki/openclaw-bitrix24/issues)
- [Discussions](https://github.com/jaaacki/openclaw-bitrix24/discussions)