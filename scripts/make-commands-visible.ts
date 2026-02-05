#!/usr/bin/env ts-node
/**
 * Bitrix24 Command Visibility Script
 * 
 * This script updates all hidden bot commands to visible status.
 * Useful when you've migrated from hidden commands and want to show them
 * in the Bitrix24 / command menu.
 * 
 * Usage:
 *   npx ts-node scripts/make-commands-visible.ts
 *   npx ts-node scripts/make-commands-visible.ts --dry-run
 *   npx ts-node scripts/make-commands-visible.ts --domain=company.bitrix24.com --botId=123
 */

import { Bitrix24Client } from '../src/client';

interface Config {
  domain: string;
  webhookSecret: string;
  userId: string;
  botId: string;
  clientId?: string;
  dryRun: boolean;
}

function getEnvConfig(): Config {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  
  // Parse command-line arguments
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    if (arg) return arg.split('=')[1];
    return undefined;
  };

  const domain = getArg('domain') || process.env.BITRIX24_DOMAIN;
  const userId = getArg('userId') || process.env.BITRIX24_USER_ID || '1';
  const botId = getArg('botId') || process.env.BITRIX24_BOT_ID;
  const webhookSecret = getArg('secret') || process.env.BITRIX24_WEBHOOK_SECRET;
  const clientId = getArg('clientId') || process.env.BITRIX24_CLIENT_ID;

  if (!domain) {
    console.error('❌ Error: Bitrix24 domain required');
    console.error('   Set BITRIX24_DOMAIN env var or use --domain=');
    process.exit(1);
  }

  if (!webhookSecret) {
    console.error('❌ Error: Webhook secret required');
    console.error('   Set BITRIX24_WEBHOOK_SECRET env var or use --secret=');
    process.exit(1);
  }

  if (!botId) {
    console.error('❌ Error: Bot ID required');
    console.error('   Set BITRIX24_BOT_ID env var or use --botId=');
    console.error('   You can find your bot ID in Bitrix24: Services > Bots > Your Bot');
    process.exit(1);
  }

  return {
    domain,
    webhookSecret,
    userId,
    botId,
    clientId,
    dryRun,
  };
}

function createLogger() {
  return {
    debug: (...args: any[]) => process.env.DEBUG && console.log('[DEBUG]', ...args),
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
  };
}

async function makeCommandsVisible(config: Config) {
  const log = createLogger();
  
  log.info('===============================================');
  log.info('  Bitrix24 Command Visibility Update Script');
  log.info('===============================================');
  log.info('');
  log.info(`Domain: ${config.domain}`);
  log.info(`Bot ID: ${config.botId}`);
  log.info(`User ID: ${config.userId}`);
  log.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE (will make changes)'}`);
  log.info('');

  const client = new Bitrix24Client({
    domain: config.domain,
    webhookSecret: config.webhookSecret,
    userId: config.userId,
    botId: config.botId,
    clientId: config.clientId,
    log,
  });

  // First, list all commands
  log.info('Fetching registered commands...');
  let commands: any[] = [];
  
  try {
    commands = await client.listCommands();
  } catch (error) {
    log.error('Failed to list commands:', error);
    process.exit(1);
  }

  if (!commands || commands.length === 0) {
    console.log('\n⚠️  No commands found for this bot.');
    console.log('   Commands must be registered first using registerCommand()');
    process.exit(0);
  }

  console.log(`\nFound ${commands.length} command(s):\n`);
  console.log('='.repeat(80));
  console.log(
    `${'ID'.padEnd(8)} ${'Command'.padEnd(20)} ${'Hidden'.padEnd(10)} ${'Common'.padEnd(10)} Status`
  );
  console.log('-'.repeat(80));

  const hiddenCommands = [];
  
  for (const cmd of commands) {
    const id = cmd.ID || cmd.COMMAND_ID || '?';
    const name = cmd.COMMAND || 'unknown';
    const hidden = cmd.HIDDEN === 'Y' || cmd.HIDDEN === true ? 'YES' : 'NO';
    const common = cmd.COMMON === 'Y' || cmd.COMMON === true ? 'YES' : 'NO';
    const status = cmd.HIDDEN === 'Y' || cmd.HIDDEN === true ? '→ UPDATE' : '✓ OK';
    
    console.log(
      `${String(id).padEnd(8)} ${name.padEnd(20)} ${hidden.padEnd(10)} ${common.padEnd(10)} ${status}`
    );

    if (cmd.HIDDEN === 'Y' || cmd.HIDDEN === true) {
      hiddenCommands.push({ id, name, cmd });
    }
  }
  
  console.log('='.repeat(80));
  console.log();

  if (hiddenCommands.length === 0) {
    console.log('✅ All commands are already visible! No updates needed.\n');
    process.exit(0);
  }

  console.log(`ℹ️  ${hiddenCommands.length} command(s) need to be made visible:\n`);
  
  for (const { id, name } of hiddenCommands) {
    console.log(`   - /${name} (ID: ${id})`);
  }
  
  console.log();

  if (config.dryRun) {
    console.log('🚫 DRY RUN: No changes made (remove --dry-run to apply)\n');
    process.exit(0);
  }

  // Confirmation
  console.log('⚠️  This will update all hidden commands to visible.');
  console.log('   Commands will appear in Bitrix24 / menu for all users.');
  console.log();

  // Perform updates
  console.log('🔄 Applying updates...\n');
  
  let successCount = 0;
  let failCount = 0;

  for (const { id, name } of hiddenCommands) {
    process.stdout.write(`   Updating /${name} (ID: ${id})... `);
    
    try {
      await client.updateCommand(id, { hidden: false });
      console.log('✅');
      successCount++;
    } catch (error) {
      console.log('❌');
      console.log(`      Error: ${error}`);
      failCount++;
    }
  }

  console.log();
  console.log('===============================================');
  console.log('  Update Complete');
  console.log('===============================================');
  console.log();
  console.log(`✅ Successfully updated: ${successCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed to update: ${failCount}`);
  }
  console.log();
  console.log('Your bot commands should now be visible in Bitrix24!');
  console.log('Test by typing / in any chat where the bot is present.\n');
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Bitrix24 Command Visibility Script
==================================

This script updates all hidden bot commands to visible status.

USAGE:
  npx ts-node scripts/make-commands-visible.ts [OPTIONS]

OPTIONS:
  --domain=DOMAIN       Bitrix24 domain (e.g., company.bitrix24.com)
  --botId=ID            Bot ID from Bitrix24
  --userId=ID           User ID (default: 1)
  --secret=SECRET       Webhook secret/token
  --clientId=ID         OAuth client ID (optional)
  --dry-run, -n         Show what would be changed without making changes
  --help, -h            Show this help message

ENVIRONMENT VARIABLES:
  BITRIX24_DOMAIN       Your Bitrix24 domain
  BITRIX24_BOT_ID       Your bot ID
  BITRIX24_USER_ID      User ID (default: 1)
  BITRIX24_WEBHOOK_SECRET  Webhook secret/token
  BITRIX24_CLIENT_ID    OAuth client ID (optional)
  DEBUG                 Set to any value to enable debug logging

EXAMPLES:
  # Using environment variables
  export BITRIX24_DOMAIN=company.bitrix24.com
  export BITRIX24_BOT_ID=123
  export BITRIX24_WEBHOOK_SECRET=secret
  npx ts-node scripts/make-commands-visible.ts

  # Using command-line arguments
  npx ts-node scripts/make-commands-visible.ts \\
    --domain=company.bitrix24.com \\
    --botId=123 \\
    --secret=secret

  # Dry run to preview changes
  npx ts-node scripts/make-commands-visible.ts --dry-run

HOW TO FIND YOUR BOT ID:
  1. Go to your Bitrix24: https://company.bitrix24.com
  2. Navigate to: Services > Bots
  3. Click on your bot
  4. The Bot ID is shown in the URL or bot details
`);
  process.exit(0);
}

// Main
const config = getEnvConfig();
makeCommandsVisible(config).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
