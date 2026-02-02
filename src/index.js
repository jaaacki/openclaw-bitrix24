/**
 * openclaw-bitrix24
 * Main entry point for the Bitrix24 connector plugin
 */

import Bitrix24Connector from './connector.js';
import Bitrix24Client from './client.js';
import { Bitrix24Account, Bitrix24AccountManager } from './account.js';

/**
 * Create Bitrix24 connector instance for OpenClaw
 * This is the function OpenClaw calls when loading the plugin
 */
export function create(config, gateway, tools) {
  return new Bitrix24Connector(config, gateway, tools);
}

/**
 * Alternative: Create connector directly (for manual usage)
 */
export function createConnector(config, gateway, tools) {
  return new Bitrix24Connector(config, gateway, tools);
}

/**
 * Create a Bitrix24 client (for direct API access)
 */
export function createClient({ domain, webhookSecret, log }) {
  return new Bitrix24Client({ domain, webhookSecret, log });
}

/**
 * Create account manager
 */
export function createAccountManager(storage) {
  return new Bitrix24AccountManager(storage);
}

// Default export (for OpenClaw)
export default {
  create,
  connector: Bitrix24Connector,
  client: Bitrix24Client,
  account: { Bitrix24Account, Bitrix24AccountManager }
};