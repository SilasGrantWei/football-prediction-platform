import { createClient, type RedisClientType } from "redis";

import { config } from "./config.js";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export async function getRedis(): Promise<RedisClientType | null> {
  if (config.demoMode) return null;
  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const redis = createClient({ url: config.redisUrl });
      redis.on("error", (error) => {
        console.warn(JSON.stringify({ level: "warn", message: "Redis error", error: String(error) }));
      });
      await redis.connect();
      client = redis as RedisClientType;
      return client;
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", message: "Redis unavailable", error: String(error) }));
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();
  if (!redis) return null;

  const value = await redis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  await redis.del(key);
}
