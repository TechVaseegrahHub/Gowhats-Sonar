class BroadcastRateLimiter {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.minInterval = 1500; // 1.5 seconds between messages
    this.batchSize = 5; // 5 messages per batch
    this.batchDelay = 3000; // 3 seconds between batches
    this.maxRetries = 3;
    this.dailyLimit = 1000; // Daily message limit per number
    this.messagesSentToday = new Map();
    this.lastResetDate = new Date().toDateString();
  }

  resetDailyCounters() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.messagesSentToday.clear();
      this.lastResetDate = today;
      console.log('📅 Daily message counters reset');
    }
  }

  async addToQueue(messagePromise, priority = 'normal', recipientPhone = null) {
    this.resetDailyCounters();

    // Check daily limit
    if (recipientPhone) {
      const sentToday = this.messagesSentToday.get(recipientPhone) || 0;
      if (sentToday >= this.dailyLimit) {
        throw new Error(`Daily message limit (${this.dailyLimit}) reached for ${recipientPhone}`);
      }
    }

    return new Promise((resolve, reject) => {
      const queueItem = {
        messagePromise,
        resolve,
        reject,
        priority,
        retryCount: 0,
        addedAt: Date.now(),
        recipientPhone
      };

      if (priority === 'high') {
        this.queue.unshift(queueItem);
      } else {
        this.queue.push(queueItem);
      }

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    console.log(`📬 Processing broadcast queue: ${this.queue.length} messages pending`);

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      console.log(`📤 Processing batch of ${batch.length} messages`);

      for (const queueItem of batch) {
        try {
          await this.processQueueItem(queueItem);
          
          // Increment daily counter
          if (queueItem.recipientPhone) {
            const current = this.messagesSentToday.get(queueItem.recipientPhone) || 0;
            this.messagesSentToday.set(queueItem.recipientPhone, current + 1);
          }
        } catch (error) {
          console.error('Queue item processing failed:', error.message);
          queueItem.reject(error);
        }
      }

      if (this.queue.length > 0) {
        console.log(`⏳ Batch completed, waiting ${this.batchDelay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, this.batchDelay));
      }
    }

    this.processing = false;
    console.log('✅ Broadcast queue processing completed');
  }

  async processQueueItem(queueItem) {
    const { messagePromise, resolve, reject, retryCount } = queueItem;

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minInterval) {
        const waitTime = this.minInterval - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const result = await messagePromise();
      this.lastRequestTime = Date.now();
      resolve(result);

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('Rate limited request failed:', error.response?.status, error.message);

      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response?.headers?.['retry-after']) || 60;
        const backoffMultiplier = Math.pow(2, retryCount);
        const waitTime = Math.min(retryAfter * 1000 * backoffMultiplier, 300000);

        console.log(`🚫 Rate limited, waiting ${waitTime / 1000} seconds... (retry ${retryCount + 1}/${this.maxRetries})`);

        if (queueItem.retryCount < this.maxRetries) {
          queueItem.retryCount++;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          await this.processQueueItem(queueItem);
        } else {
          console.error(`❌ Max retries exceeded after rate limiting`);
          reject(new Error(`Rate limited after ${this.maxRetries} retries`));
        }
      } else if (error.response?.status >= 500 && queueItem.retryCount < this.maxRetries) {
        queueItem.retryCount++;
        console.log(`🔄 Server error, retrying... (attempt ${queueItem.retryCount}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.processQueueItem(queueItem);
      } else {
        reject(error);
      }
    }
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      lastRequestTime: this.lastRequestTime,
      dailyMessageCounts: Object.fromEntries(this.messagesSentToday)
    };
  }

  clearQueue() {
    this.queue = [];
    this.processing = false;
    console.log('🧹 Broadcast queue cleared');
  }
}

module.exports = new BroadcastRateLimiter();
