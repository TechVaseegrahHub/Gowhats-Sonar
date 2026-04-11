const redisClient = require('../config/redis');

class RedisService {
  // SESSION MANAGEMENT
  async setWhatsAppSession(tenantId, sessionData, ttl = 3600) {
    try {
      const key = `whatsapp:session:${tenantId}`;
      await redisClient.setex(key, ttl, JSON.stringify(sessionData));
      console.log(`✅ WhatsApp session stored for tenant: ${tenantId}`);
      return true;
    } catch (error) {
      console.error('Redis setWhatsAppSession error:', error);
      return false;
    }
  }

  async getWhatsAppSession(tenantId) {
    try {
      const key = `whatsapp:session:${tenantId}`;
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getWhatsAppSession error:', error);
      return null;
    }
  }

  async deleteWhatsAppSession(tenantId) {
    try {
      const key = `whatsapp:session:${tenantId}`;
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis deleteWhatsAppSession error:', error);
      return false;
    }
  }

  // MESSAGE QUEUE
  async enqueueMessage(tenantId, messageData) {
    try {
      const key = `message:queue:${tenantId}`;
      await redisClient.lpush(key, JSON.stringify(messageData));
      return true;
    } catch (error) {
      console.error('Redis enqueueMessage error:', error);
      return false;
    }
  }

  async dequeueMessage(tenantId) {
    try {
      const key = `message:queue:${tenantId}`;
      const message = await redisClient.rpop(key);
      return message ? JSON.parse(message) : null;
    } catch (error) {
      console.error('Redis dequeueMessage error:', error);
      return null;
    }
  }

  async getQueueLength(tenantId) {
    try {
      const key = `message:queue:${tenantId}`;
      return await redisClient.llen(key);
    } catch (error) {
      console.error('Redis getQueueLength error:', error);
      return 0;
    }
  }

  // RATE LIMITING
  async checkRateLimit(key, limit, windowSeconds) {
    try {
      const current = await redisClient.incr(`ratelimit:${key}`);

      if (current === 1) {
        await redisClient.expire(`ratelimit:${key}`, windowSeconds);
      }

      return {
        allowed: current <= limit,
        current: current,
        limit: limit,
        remaining: Math.max(0, limit - current)
      };
    } catch (error) {
      console.error('Redis checkRateLimit error:', error);
      return { allowed: true, current: 0, limit: limit, remaining: limit };
    }
  }

  async resetRateLimit(key) {
    try {
      await redisClient.del(`ratelimit:${key}`);
      return true;
    } catch (error) {
      console.error('Redis resetRateLimit error:', error);
      return false;
    }
  }

  // CACHING
  async cacheContacts(tenantId, contacts, ttl = 300) {
    try {
      const key = `cache:contacts:${tenantId}`;
      await redisClient.setex(key, ttl, JSON.stringify(contacts));
      return true;
    } catch (error) {
      console.error('Redis cacheContacts error:', error);
      return false;
    }
  }

  async getCachedContacts(tenantId) {
    try {
      const key = `cache:contacts:${tenantId}`;
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getCachedContacts error:', error);
      return null;
    }
  }

  async cacheTemplates(tenantId, templates, ttl = 600) {
    try {
      const key = `cache:templates:${tenantId}`;
      await redisClient.setex(key, ttl, JSON.stringify(templates));
      return true;
    } catch (error) {
      console.error('Redis cacheTemplates error:', error);
      return false;
    }
  }

  async getCachedTemplates(tenantId) {
    try {
      const key = `cache:templates:${tenantId}`;
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getCachedTemplates error:', error);
      return null;
    }
  }

  async invalidateCache(pattern) {
    try {
      const keys = await redisClient.keys(`cache:${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`✅ Invalidated ${keys.length} cache keys matching: cache:${pattern}*`);
      }
      return true;
    } catch (error) {
      console.error('Redis invalidateCache error:', error);
      return false;
    }
  }

  // BROADCAST TRACKING
  async trackBroadcastProgress(broadcastId, recipientPhone, status) {
    try {
      const key = `broadcast:${broadcastId}:status`;
      await redisClient.hincrby(key, status, 1);
      await redisClient.expire(key, 86400);

      const recipientKey = `broadcast:${broadcastId}:recipients`;
      await redisClient.hset(recipientKey, recipientPhone, status);
      await redisClient.expire(recipientKey, 86400);

      return true;
    } catch (error) {
      console.error('Redis trackBroadcastProgress error:', error);
      return false;
    }
  }

  async getBroadcastProgress(broadcastId) {
    try {
      const key = `broadcast:${broadcastId}:status`;
      const data = await redisClient.hgetall(key);
      return {
        sent: parseInt(data.sent || 0),
        delivered: parseInt(data.delivered || 0),
        read: parseInt(data.read || 0),
        failed: parseInt(data.failed || 0)
      };
    } catch (error) {
      console.error('Redis getBroadcastProgress error:', error);
      return { sent: 0, delivered: 0, read: 0, failed: 0 };
    }
  }

  // ✅ CRITICAL: Pattern deletion for cache invalidation (FIXED - NOW INSIDE CLASS)
  async deletePattern(pattern) {
    try {
      // Use SCAN instead of KEYS for better performance
      let cursor = '0';
      let deletedCount = 0;

      do {
        const reply = await redisClient.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', '100'
        );

        cursor = reply[0];
        const keys = reply[1];

        if (keys.length > 0) {
          await redisClient.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      console.log(`🗑️ Deleted ${deletedCount} keys matching ${pattern}`);
      return deletedCount;
    } catch (error) {
      console.error('Redis deletePattern error:', error);
      return 0;
    }
  }

  // ✅ Cache with automatic JSON handling (FIXED - NOW INSIDE CLASS)
  async cacheJSON(key, data, ttl = 300) {
    try {
      if (ttl) {
        await redisClient.setex(key, ttl, JSON.stringify(data));
      } else {
        await redisClient.set(key, JSON.stringify(data));
      }
      return true;
    } catch (error) {
      console.error('Redis cacheJSON error:', error);
      return false;
    }
  }

  // ✅ Get cached JSON data (FIXED - NOW INSIDE CLASS)
  async getCachedJSON(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getCachedJSON error:', error);
      return null;
    }
  }

  // UTILITY METHODS
  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await redisClient.setex(key, ttl, JSON.stringify(value));
      } else {
        await redisClient.set(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      return await redisClient.exists(key) === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }

  async ping() {
    try {
      const response = await redisClient.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  }

  async getStats() {
    try {
      const info = await redisClient.info('stats');
      return info;
    } catch (error) {
      console.error('Redis getStats error:', error);
      return null;
    }
  }

  async flushAll() {
    try {
      await redisClient.flushall();
      console.log('✅ Redis cache flushed');
      return true;
    } catch (error) {
      console.error('Redis flushAll error:', error);
      return false;
    }
  }
}

module.exports = new RedisService();
