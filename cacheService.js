// cacheService.js
class MicroCacheService {
  constructor(ttlBytes = 60000) { 
    this.cache = new Map();
    this.ttl = ttlBytes; // Cache lifetime: 60 seconds
  }

  setPayload(sessionId, rawPayload) {
    const expiry = Date.now() + this.ttl;
    this.cache.set(sessionId, { data: rawPayload, expiry });
    
    // Auto-evict to prevent memory leaks
    setTimeout(() => {
      this.evict(sessionId);
    }, this.ttl);
  }

  getPayload(sessionId) {
    const cached = this.cache.get(sessionId);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.cache.delete(sessionId);
      return null;
    }
    return cached.data;
  }

  evict(sessionId) {
    this.cache.delete(sessionId);
  }
}

module.exports = new MicroCacheService();