/**
 * Bitrix24 Connector Plugin for OpenClaw
 * 
 * This plugin integrates Bitrix24 chat as an OpenClaw channel,
 * enabling two-way messaging via webhooks and REST API.
 */

import Bitrix24Client from './client.js';

class Bitrix24Connector {
  constructor(config, gateway, tools) {
    this.config = config;
    this.gateway = gateway;
    this.tools = tools;
    this.clients = new Map(); // domain → Bitrix24Client
  }

  // Initialize connector - called by OpenClaw on startup
  async initialize() {
    const { domains, webhookSecret } = this.config;
    
    if (!domains || !Array.isArray(domains)) {
      throw new Error('bitrix24: domains array required in config');
    }

    if (!webhookSecret) {
      throw new Error('bitrix24: webhookSecret required in config');
    }

    // Create clients for each domain
    for (const domain of domains) {
      const client = new Bitrix24Client({
        domain,
        webhookSecret: this.config.webhookSecret,
        log: this.gateway.log
      });
      
      this.clients.set(domain, client);
    }

    this.gateway.log.info(`Bitrix24 connector initialized for ${domains.length} domain(s)`);
  }

  // Handle incoming webhook events from Bitrix24
  async handleWebhook(domain, event, payload) {
    const client = this.clients.get(domain);
    if (!client) {
      this.gateway.log.error(`Unknown domain in webhook: ${domain}`);
      return { status: 400, error: 'Unknown domain' };
    }

    // Verify webhook secret
    if (payload.auth && payload.auth.event_token !== client.webhookSecret) {
      this.gateway.log.error('Webhook auth token mismatch');
      return { status: 401, error: 'Unauthorized' };
    }

    // Handle event types
    switch (event) {
      case 'ONIMBOTMESSAGEADD':
        await this.handleIncomingMessage(domain, payload);
        break;
      default:
        this.gateway.log.debug(`Unhandled event: ${event}`);
    }

    return { status: 200 };
  }

  // Handle incoming message from Bitrix24
  async handleIncomingMessage(domain, payload) {
    const client = this.clients.get(domain);
    const { data } = payload || {};

    if (!data) {
      this.gateway.log.warn('Webhook message missing data payload');
      return;
    }

    const { PARAMS, COMMAND } = data;
    const { FROM_USER_ID, MESSAGE } = PARAMS || {};

    if (!FROM_USER_ID || !MESSAGE) {
      this.gateway.log.warn('Webhook message missing required fields');
      return;
    }

    // Convert Bitrix24 message format to OpenClaw format
    const message = {
      id: payload.event_id,
      text: MESSAGE,
      from: {
        id: FROM_USER_ID.toString(),
        platform: 'bitrix24'
      },
      timestamp: new Date().toISOString(),
      channel: {
        id: domain,
        provider: 'bitrix24'
      }
    };

    // Route to OpenClaw for processing
    await this.gateway.onMessage(message, 'bitrix24');
  }

  // Send message to Bitrix24
  async send(target, message, options = {}) {
    const { domain, userId } = this.parseTarget(target);
    const client = this.clients.get(domain);

    if (!client) {
      throw new Error(`Unknown Bitrix24 domain: ${domain}`);
    }

    // Send via REST API
    return await client.sendMessage({
      userId,
      text: message,
      ...options
    });
  }

  // Parse target string (e.g., "domain/user123" or "user123")
  parseTarget(target) {
    if (target.includes('/')) {
      const [domain, userId] = target.split('/');
      return { domain, userId };
    }
    
    // Default to first configured domain
    const firstDomain = this.config.domains?.[0];
    return { domain: firstDomain, userId: target };
  }

  // Health check
  async health() {
    const results = [];
    
    for (const [domain, client] of this.clients) {
      try {
        const isHealthy = await client.health();
        results.push({ domain, status: isHealthy ? 'ok' : 'error' });
      } catch (err) {
        results.push({ domain, status: 'error', error: err.message });
      }
    }

    return results;
  }

  // Cleanup on shutdown
  async destroy() {
    this.clients.clear();
    this.gateway.log.info('Bitrix24 connector destroyed');
  }
}

// Export for OpenClaw registry
export default function createBitrix24Connector(config, gateway, tools) {
  return new Bitrix24Connector(config, gateway, tools);
}

export {
  Bitrix24Connector
};