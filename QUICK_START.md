# Quick Start Guide - OpenClaw Bitrix24 Plugin

## Installation (3 Steps)

### 1. Install Plugin
```bash
openclaw plugins install ~/Dev/openclaw-bitrix24
```

### 2. Configure
Edit `~/.openclaw/openclaw.json`:
```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domain": "yourcompany.bitrix24.com",
      "webhookSecret": "your-webhook-secret",
      "userId": "1"
    }
  }
}
```

### 3. Restart
```bash
openclaw gateway restart
```

---

## Verify Installation

```bash
# Check plugin is installed
openclaw plugins list | grep bitrix24

# Check status
openclaw status
```

Expected output:
```
✓ bitrix24: installed
```

---

## Get Bitrix24 Credentials

1. Go to: `https://yourcompany.bitrix24.com`
2. Navigate: **Settings** → **Integrations** → **Webhooks**
3. Create **Inbound Webhook**
4. Copy:
   - Domain: `yourcompany.bitrix24.com`
   - Webhook Secret: The token shown
   - User ID: Usually `1` (admin)

---

## Test the Plugin

```bash
# Send a test message
openclaw message send \
  --channel bitrix24 \
  --target "USER_ID" \
  "Hello from OpenClaw!"
```

Replace `USER_ID` with actual Bitrix24 user ID.

---

## Troubleshooting

### Plugin Not Found
```bash
# Check installation path
ls -la ~/Dev/openclaw-bitrix24/index.ts

# Reinstall
openclaw plugins install ~/Dev/openclaw-bitrix24
```

### Configuration Errors
```bash
# Validate config
openclaw doctor --non-interactive

# Check logs
openclaw gateway logs
```

### Connection Issues
```bash
# Check account health
openclaw status --verbose

# Verify credentials in config
cat ~/.openclaw/openclaw.json | grep -A 5 bitrix24
```

---

## Documentation

- **Full Details**: See `PLUGIN_UPDATE_SUMMARY.md`
- **Migration Guide**: See `MIGRATION.md`
- **Configuration**: See `README.md`

---

## Support

Issues: https://github.com/jaaacki/openclaw-bitrix24/issues
