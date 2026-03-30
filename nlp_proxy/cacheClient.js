const createInMemoryClient = () => {
  const store = new Map();
  
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiry && Date.now() > entry.expiry) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    
    async set(key, value, options = {}) {
      const expiry = options.EX ? Date.now() + options.EX * 1000 : null;
      store.set(key, { value, expiry });
      return "OK";
    },
    
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    
    on() {
      return this;
    },
  };
};

let client = null;

const createClient = () => {
  if (client) return client;
  
  try {
    const Redis = require("ioredis");
    client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    });
    
    client.on("error", (err) => {
      console.warn("Redis connection failed, using in-memory fallback:", err.message);
      client = createInMemoryClient();
    });
    
    return client;
  } catch {
    console.warn("Redis not available, using in-memory cache");
    return createInMemoryClient();
  }
};

export { createClient };
