/**
 * Session memory for admin screens. Shows the last payload immediately,
 * then the page still refetches. Never used for exports or writes.
 */

export const ADMIN_STATS = { key: "stats", url: "/api/admin/stats" };
export const ADMIN_CONFIRMATIONS = {
  key: "confirmations",
  url: "/api/admin/confirmations",
};
export const ADMIN_COUNTS = {
  key: "counts",
  url: "/api/admin/confirmations?countsOnly=1",
};
export const ADMIN_HORS = {
  key: "hors",
  url: "/api/admin/final/hors-delai",
};
export const ADMIN_AGENTS = { key: "agents", url: "/api/admin/agents" };

type Slot = { gen: number; data: unknown };

const slots = new Map<string, Slot>();
const inflight = new Map<string, Promise<unknown>>();
const gen = new Map<string, number>();

export function readAdminCache<T>(key: string): T | null {
  const slot = slots.get(key);
  return slot ? (slot.data as T) : null;
}

export function writeAdminCache(key: string, data: unknown) {
  const my = (gen.get(key) || 0) + 1;
  gen.set(key, my);
  slots.set(key, { gen: my, data });
}

/** Page load. A failed menu prefetch is retried once so the screen still loads. */
export async function loadAdmin<T>(
  key: string,
  url: string,
  opts?: { fresh?: boolean },
): Promise<T> {
  try {
    return await beginAdminGet<T>(key, url, opts);
  } catch (e) {
    if (opts?.fresh) throw e;
    return beginAdminGet<T>(key, url, { fresh: true });
  }
}

export function invalidateAdminCache(key: string) {
  slots.delete(key);
  gen.set(key, (gen.get(key) || 0) + 1);
}

export function beginAdminGet<T>(
  key: string,
  url: string,
  opts?: { fresh?: boolean },
): Promise<T> {
  if (opts?.fresh) gen.set(key, (gen.get(key) || 0) + 1);
  const my = gen.get(key) || 0;

  if (!opts?.fresh) {
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const task = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as T & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Impossible de charger");
      }
      if ((gen.get(key) || 0) === my) {
        slots.set(key, { gen: my, data });
      }
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === task) inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}
