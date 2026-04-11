const redisClient = require('../config/redis');

class RedisService {
  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================
  
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

  // ==========================================
  // RATE LIMITING
  // ==========================================
  
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

  // ==========================================
  // CACHING
  // ==========================================
  
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

  async invalidateCache(pattern) {
    try {
      const keys = await redisClient.keys(`cache:${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`✅ Invalidated ${keys.length} cache keys`);
      }
      return true;
    } catch (error) {
      console.error('Redis invalidateCache error:', error);
      return false;
    }
  }

  // ==========================================
  // UTILITY
  // ==========================================
  
  async ping() {
    try {
      const response = await redisClient.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
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

  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  }
}

module.exports = new RedisService();
