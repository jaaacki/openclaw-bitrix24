/**
 * Bitrix24 Account Manager
 * Handles Bitrix24 domain credentials and authentication
 */

class Bitrix24Account {
  constructor({ domain, accessToken, webhookSecret, userId }) {
    this.domain = domain;
    this.accessToken = accessToken;
    this.webhookSecret = webhookSecret;
    this.userId = userId;
    this.createdAt = new Date();
  }

  // Get full API URL (for outbound requests)
  getApiUrl() {
    return `https://${this.domain}/rest/${this.userId}/${this.accessToken}`;
  }

  // Get webhook URL (for inbound events)
  getWebhookUrl(path) {
    return `https://${this.domain}/rest/${this.userId}/${this.accessToken}/${path}`;
  }

  // Validate account data
  isValid() {
    return !!(this.domain && this.accessToken && this.webhookSecret);
  }

  // Convert to JSON (for storage)
  toJSON() {
    return {
      domain: this.domain,
      accessToken: this.accessToken,
      webhookSecret: this.webhookSecret,
      userId: this.userId,
      createdAt: this.createdAt
    };
  }

  // Create from JSON (for loading)
  static fromJSON(data) {
    return new Bitrix24Account({
      domain: data.domain,
      accessToken: data.accessToken,
      webhookSecret: data.webhookSecret,
      userId: data.userId
    });
  }
}

class Bitrix24AccountManager {
  constructor(storage) {
    this.storage = storage; // OpenClaw storage interface
    this.accounts = new Map();
  }

  // Load accounts from storage
  async load() {
    try {
      const data = await this.storage.get('bitrix24-accounts', '[]');
      const accounts = JSON.parse(data);

      for (const accountData of accounts) {
        const account = Bitrix24Account.fromJSON(accountData);
        this.accounts.set(account.domain, account);
      }

      return this.accounts.size;
    } catch (error) {
      console.error('Failed to load Bitrix24 accounts:', error);
      return 0;
    }
  }

  // Save accounts to storage
  async save() {
    try {
      const accounts = Array.from(this.accounts.values()).map(acc => acc.toJSON());
      await this.storage.set('bitrix24-accounts', JSON.stringify(accounts));
      return true;
    } catch (error) {
      console.error('Failed to save Bitrix24 accounts:', error);
      return false;
    }
  }

  // Add new account
  async add({ domain, accessToken, webhookSecret, userId }) {
    if (this.accounts.has(domain)) {
      throw new Error(`Account already exists for domain: ${domain}`);
    }

    const account = new Bitrix24Account({
      domain,
      accessToken,
      webhookSecret,
      userId
    });

    if (!account.isValid()) {
      throw new Error('Invalid account data');
    }

    this.accounts.set(domain, account);
    await this.save();

    return account;
  }

  // Remove account
  async remove(domain) {
    if (!this.accounts.has(domain)) {
      throw new Error(`Account not found for domain: ${domain}`);
    }

    this.accounts.delete(domain);
    await this.save();
  }

  // Get account by domain
  get(domain) {
    return this.accounts.get(domain);
  }

  // Check if account exists
  has(domain) {
    return this.accounts.has(domain);
  }

  // List all domains
  listDomains() {
    return Array.from(this.accounts.keys());
  }

  // Clear all accounts
  async clear() {
    this.accounts.clear();
    await this.save();
  }
}

export { Bitrix24Account, Bitrix24AccountManager };