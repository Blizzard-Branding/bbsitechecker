import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const AUDITS_PER_DAY = 10;

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(AUDITS_PER_DAY, "1 d"),
      prefix: "bb-site-checker",
    });
  }
  return ratelimit;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkAuditRateLimit(ip: string): Promise<RateLimitResult> {
  const limiter = getRatelimit();
  if (!limiter) {
    // No Upstash configured (e.g. local dev): don't block.
    return { allowed: true, remaining: AUDITS_PER_DAY };
  }
  const { success, remaining } = await limiter.limit(ip);
  return { allowed: success, remaining };
}
