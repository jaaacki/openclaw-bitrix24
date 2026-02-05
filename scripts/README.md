# Bitrix24 Plugin Scripts

This folder contains utility scripts for managing Bitrix24 bot commands and configuration.

## Available Scripts

### make-commands-visible.ts

Updates all hidden bot commands to visible status. This is useful when you've previously registered commands as `hidden: true` and now want them to appear in Bitrix24's `/` command menu.

#### Usage

**With environment variables:**
```bash
export BITRIX24_DOMAIN=yourcompany.bitrix24.com
export BITRIX24_BOT_ID=123
export BITRIX24_USER_ID=1
export BITRIX24_WEBHOOK_SECRET=your-secret

npx ts-node scripts/make-commands-visible.ts
```

**With command-line arguments:**
```bash
npx ts-node scripts/make-commands-visible.ts \
  --domain=yourcompany.bitrix24.com \
  --botId=123 \
  --secret=your-secret
```

**Dry run (preview without changes):**
```bash
npx ts-node scripts/make-commands-visible.ts --dry-run
```

**Show help:**
```bash
npx ts-node scripts/make-commands-visible.ts --help
```

#### What it does

1. Lists all registered commands for your bot
2. Identifies commands where `HIDDEN = "Y"`
3. Updates each hidden command to `HIDDEN = "N"`
4. Shows a summary of changes made

#### Finding Your Bot ID

1. Go to your Bitrix24: https://yourcompany.bitrix24.com
2. Navigate to: **Services → Bots**
3. Click on your bot
4. The Bot ID is shown in the URL or bot details

#### API Reference

This script uses:
- `imbot.command.get` - List all registered commands
- `imbot.command.update` - Update command visibility

## Related: Programmatic API

You can also use these features directly in your code:

```typescript
import { Bitrix24Client } from 'openclaw-bitrix24/src/client';

const client = new Bitrix24Client({...});

// Make all hidden commands visible
const result = await client.showAllCommands();

// Or update specific commands
await client.updateCommand(1, { hidden: false });
await client.updateCommand(1, { common: true });

// Bulk update multiple commands
await client.bulkUpdateCommands([1, 2, 3], { hidden: false });
```

See the main README for more details on command management.
