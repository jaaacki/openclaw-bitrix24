# Bitrix24 Plugin Migration to OpenClaw Format

## Overview

This document describes the transformation of the openclaw-bitrix24 plugin from a generic connector format to OpenClaw's official channel plugin format.

## Changes Made

### 1. Plugin Structure

**Before:**
- JavaScript-based plugin
- Generic connector interface
- Custom initialization pattern
- No formal plugin manifest

**After:**
- TypeScript-based plugin
- Official ChannelPlugin interface
- Standard OpenClaw plugin manifest
- Proper SDK integration

### 2. Files Created/Modified

#### New Files (TypeScript)
| File | Purpose |
|------|---------|
| `index.ts` | Main plugin entry point with manifest |
| `src/runtime.ts` | Runtime dependency injection |
| `src/channel.ts` | ChannelPlugin implementation |
| `src/config.ts` | Configuration schema (Zod) |
| `src/accounts.ts` | Account resolution logic |
| `src/client.ts` | Bitrix24 API client (TS version) |
| `tsconfig.json` | TypeScript configuration |

#### Removed Files (JavaScript)
- `src/index.js` - Replaced by `index.ts`
- `src/connector.js` - Replaced by `src/channel.ts`
- `src/client.js` - Replaced by `src/client.ts`
- `src/account.js` - Replaced by `src/accounts.ts`

#### Modified Files
- `package.json` - Updated for TypeScript, added dependencies
- `README.md` - Updated installation and configuration instructions

### 3. Architecture Changes

#### Plugin Entry Point
```typescript
// index.ts
const plugin = {
  id: "bitrix24",
  name: "Bitrix24",
  description: "Bitrix24 channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setBitrix24Runtime(api.runtime);
    api.registerChannel({ plugin: bitrix24Plugin });
  },
};
```

#### Channel Plugin Implementation
The plugin now implements OpenClaw's `ChannelPlugin` interface with:
- **Capabilities**: Chat types, reactions, threads, media support
- **Config**: Account management, resolution, validation
- **Security**: DM policies, warnings, allow lists
- **Messaging**: Target normalization, directory integration
- **Outbound**: Text/media sending with chunking
- **Status**: Health checks, probing, runtime snapshots
- **Gateway**: Account start/stop, logout handling

### 4. Configuration Format

#### Before (Generic)
```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domains": ["company.bitrix24.com"],
      "webhookSecret": "secret"
    }
  }
}
```

#### After (OpenClaw Standard)
```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domain": "company.bitrix24.com",
      "webhookSecret": "secret",
      "userId": "1"
    }
  }
}
```

#### Multi-Account Support
```json
{
  "channels": {
    "bitrix24": {
      "accounts": {
        "company1": {
          "enabled": true,
          "name": "Company 1",
          "domain": "company1.bitrix24.com",
          "webhookSecret": "secret1"
        }
      }
    }
  }
}
```

### 5. Dependencies Added

```json
{
  "peerDependencies": {
    "openclaw": "^2026.1.0"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

### 6. TypeScript Configuration

- Target: ES2022
- Module: ES2022 (ESM)
- Strict mode enabled
- Declaration files generated
- Node types included

## Installation

### For Development
```bash
cd ~/Dev/openclaw-bitrix24
openclaw plugins install .
```

### For Production
```bash
openclaw plugins install openclaw-bitrix24
```

## Verification

Check plugin status:
```bash
openclaw plugins list
openclaw status
```

## Breaking Changes

1. **Configuration Format**: 
   - Changed from `domains` array to single `domain` string
   - Added `userId` field (required for some API calls)
   - Multi-account now uses `accounts` object

2. **API Changes**:
   - Plugin must be installed via `openclaw plugins install`
   - No longer supports direct import/require
   - Must use OpenClaw's channel interface

3. **Initialization**:
   - No manual initialization needed
   - OpenClaw handles plugin lifecycle
   - Runtime injection via SDK

## Migration Guide for Users

### Step 1: Update Configuration
```bash
# Old format
{
  "channels": {
    "bitrix24": {
      "domains": ["company.bitrix24.com"]
    }
  }
}

# New format
{
  "channels": {
    "bitrix24": {
      "domain": "company.bitrix24.com",
      "userId": "1"
    }
  }
}
```

### Step 2: Install Updated Plugin
```bash
openclaw plugins uninstall openclaw-bitrix24
openclaw plugins install ~/Dev/openclaw-bitrix24
```

### Step 3: Restart OpenClaw
```bash
openclaw gateway restart
```

### Step 4: Verify
```bash
openclaw status
```

## Testing

1. **Installation Test**:
   ```bash
   openclaw plugins install ~/Dev/openclaw-bitrix24
   ```

2. **Configuration Test**:
   Add config to `openclaw.json` and validate

3. **Connection Test**:
   ```bash
   openclaw status
   ```

4. **Message Test**:
   Send a test message to verify integration

## Technical Details

### Plugin Registration Flow
1. OpenClaw loads plugin via `index.ts`
2. Calls `plugin.register(api)`
3. Plugin sets runtime via `setBitrix24Runtime(api.runtime)`
4. Plugin registers channel via `api.registerChannel()`
5. OpenClaw initializes channel according to config

### Runtime Access
```typescript
import { getBitrix24Runtime } from "./runtime.js";

// Access OpenClaw services
const runtime = getBitrix24Runtime();
runtime.logging.info("Message");
runtime.config.readConfigFile();
```

### Account Resolution
```typescript
import { resolveBitrix24Account } from "./accounts.js";

const account = resolveBitrix24Account({
  cfg: openclaw.config,
  accountId: "default"
});
```

## Known Limitations

1. **Webhook Mode**: Bitrix24 uses webhooks (not polling)
   - User must configure webhook in Bitrix24 admin panel
   - Gateway.startAccount() is passive (doesn't poll)

2. **Media Support**: Basic implementation
   - URLs passed in message text
   - File upload needs enhancement

3. **Features Not Implemented**:
   - Thread support
   - Reactions
   - Native commands
   - Group mention requirements

## Future Improvements

1. Enhanced file/media handling
2. Thread support (if Bitrix24 API supports)
3. Better error handling and retry logic
4. Webhook server integration
5. Bot command parsing
6. Group chat features

## References

- [OpenClaw Plugin SDK](https://github.com/openclaw/openclaw)
- [Bitrix24 REST API](https://dev.1c-bitrix.ru/rest_help/)
- [Telegram Plugin](file:///opt/homebrew/lib/node_modules/openclaw/extensions/telegram/)
- [Discord Plugin](file:///opt/homebrew/lib/node_modules/openclaw/extensions/discord/)

## Support

For issues or questions:
- GitHub Issues: https://github.com/jaaacki/openclaw-bitrix24/issues
- OpenClaw Discord: [link]

---

**Migration Date**: February 2, 2026  
**OpenClaw Version**: 2026.1.0  
**Plugin Version**: 0.1.0
