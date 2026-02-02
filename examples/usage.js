/**
 * Example usage of openclaw-bitrix24
 * 
 * This shows how to use the Bitrix24 connector programmatically
 * (outside of OpenClaw's automatic channel integration)
 */

import { createClient, createAccountManager } from '../src/index.js';

// Example 1: Send a message to Bitrix24
async function sendMessageExample() {
  const client = createClient({
    domain: 'yourcompany.bitrix24.com',
    webhookSecret: 'your-secret-token',
    log: console
  });

  try {
    const result = await client.sendMessage({
      userId: '123',
      text: 'Hello from OpenClaw Bitrix24 connector!',
      options: {
        SYSTEM: 'Y'
      }
    });

    console.log('Message sent:', result);
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}

// Example 2: Check Bitrix24 health
async function healthCheckExample() {
  const client = createClient({
    domain: 'yourcompany.bitrix24.com',
    webhookSecret: 'your-secret-token',
    log: console
  });

  const isHealthy = await client.health();
  console.log('Bitrix24 is healthy:', isHealthy);
}

// Example 3: Format conversion (BB-code ↔ Markdown)
async function formatConversionExample() {
  const client = createClient({
    domain: 'yourcompany.bitrix24.com',
    webhookSecret: 'your-secret-token',
    log: console
  });

  const bbCode = '[b]Bold text[/b] [i]italic[/i]';
  const markdown = client.bbToMarkdown(bbCode);
  console.log('BB to Markdown:', markdown); // **Bold text** *italic*

  const md = '**Bold** *italic*';
  const bb = client.markdownToBb(md);
  console.log('Markdown to BB:', bb); // [b]Bold[/b] [i]italic[/i]
}

// Example 4: Account management
async function accountManagementExample() {
  const storage = {
    get: async (key, defaultValue) => defaultValue,
    set: async (key, value) => console.log(`Stored: ${key}`)
  };

  const manager = createAccountManager(storage);

  // Load accounts
  const count = await manager.load();
  console.log(`Loaded ${count} accounts`);

  // Add new account
  await manager.add({
    domain: 'yourcompany.bitrix24.com',
    accessToken: 'your-access-token',
    webhookSecret: 'your-secret',
    userId: '123'
  });

  // List domains
  const domains = manager.listDomains();
  console.log('Domains:', domains);

  // Get account
  const account = manager.get('yourcompany.bitrix24.com');
  console.log('Account:', account?.toJSON());
}

// Run all examples (comment out what you don't need)
async function main() {
  console.log('=== Bitrix24 Connector Examples ===\n');

  // Uncomment to run examples:
  // await sendMessageExample();
  // await healthCheckExample();
  // await formatConversionExample();
  // await accountManagementExample();

  console.log('\nUncomment examples in main() to run them');
}

main().catch(console.error);