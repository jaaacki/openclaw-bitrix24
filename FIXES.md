# OpenClaw Bitrix24 Plugin - Fixes Applied

This document outlines all fixes required to make the plugin compatible with OpenClaw 2026.2.x.

---

## 1. Created Plugin Manifest File

**File:** `openclaw.plugin.json` (new file)

OpenClaw requires a manifest file declaring the plugin ID and channels it provides.

```json
{
  "id": "openclaw-bitrix24",
  "channels": ["bitrix24"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

## 2. Fixed `package.json` Extensions Format

**File:** `package.json`

The `openclaw.extensions` field must be an array of file paths, not an array of objects.

**Before:**
```json
"openclaw": {
  "extensions": [
    {
      "kind": "channel",
      "id": "bitrix24",
      "name": "Bitrix24",
      "entry": "index.ts"
    }
  ]
}
```

**After:**
```json
"openclaw": {
  "extensions": [
    "./index.ts"
  ]
}
```

---

## 3. Updated Zod Dependency to v4

**File:** `package.json`

OpenClaw 2026.2.x uses Zod 4.x which has the `toJSONSchema()` method built-in. Zod 3.x does not have this method.

**Before:**
```json
"dependencies": {
  "zod": "^3.22.0"
}
```

**After:**
```json
"dependencies": {
  "zod": "^4.3.0"
}
```

After changing, run `npm install` to update dependencies.

---

## 4. Fixed Zod v4 API Change in Config Schema

**File:** `src/config.ts`

In Zod 4, `z.record()` requires two arguments (key schema and value schema). In Zod 3, it only required the value schema.

**Before:**
```typescript
accounts: z.record(Bitrix24AccountConfigSchema).optional(),
```

**After:**
```typescript
accounts: z.record(z.string(), Bitrix24AccountConfigSchema).optional(),
```

---

## 5. Fixed Logging API Usage

**File:** `index.ts`

The plugin API provides `api.logger` for logging, not `api.runtime.logging`.

**Before:**
```typescript
api.runtime.logging.info("[Bitrix24] Plugin registered with webhook handler");
```

**After:**
```typescript
api.logger.info("[Bitrix24] Plugin registered with webhook handler");
```

---

## 6. Fixed Plugin ID Mismatch

**File:** `index.ts`

The plugin's exported ID must match the ID used in the config (`plugins.entries.openclaw-bitrix24`) and the manifest (`openclaw.plugin.json`).

**Before:**
```typescript
const plugin = {
  id: "bitrix24",
  // ...
}
```

**After:**
```typescript
const plugin = {
  id: "openclaw-bitrix24",
  // ...
}
```

---

## 7. Fixed `collectStatusIssues` Function Signature

**File:** `src/channel.ts`

The `collectStatusIssues` function receives an array of account snapshots and must return an array of `ChannelStatusIssue` objects (not plain strings).

**Before:**
```typescript
collectStatusIssues: ({ account }) => {
  const issues: string[] = [];

  if (!account.domain) {
    issues.push("Bitrix24 domain not configured");
  }
  if (!account.webhookSecret) {
    issues.push("Webhook secret not configured");
  }

  return issues;
},
```

**After:**
```typescript
collectStatusIssues: (accounts) => {
  const issues: Array<{ level: "warn" | "error"; message: string }> = [];

  for (const snapshot of accounts) {
    if (!snapshot.domain) {
      issues.push({ level: "error", message: `[${snapshot.accountId}] Bitrix24 domain not configured` });
    }
  }

  return issues;
},
```

---

## Installation Command

To install the plugin as a linked local development plugin:

```bash
openclaw plugins install --link ~/Dev/openclaw-bitrix24
```

---

## OpenClaw Config

The channel configuration in `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "bitrix24": {
      "enabled": true,
      "domain": "your-domain.bitrix24.com",
      "webhookSecret": "your-webhook-secret",
      "userId": "1"
    }
  },
  "plugins": {
    "entries": {
      "openclaw-bitrix24": {
        "enabled": true
      }
    }
  }
}
```

---

## Verification

After applying all fixes:

```bash
openclaw gateway restart
openclaw status
```

Expected output should show:
```
│ bitrix24 │ ON      │ OK     │ configured │
```
