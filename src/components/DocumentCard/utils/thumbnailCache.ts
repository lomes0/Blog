/**
 * Cache entry interface for thumbnail cache
 */
interface CacheEntry {
  value: string;
  expiry: number;
  lastAccessed: number;
  size: number; // Store the size for memory management
}

/**
 * Advanced thumbnail cache with LRU eviction, TTL, and memory management
 *
 * This cache implements:
 * - LRU (Least Recently Used) eviction policy
 * - TTL (Time To Live) for automatic cleanup
 * - Memory size limits to prevent memory leaks
 * - Automatic cleanup of expired entries
 */
class ThumbnailCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly maxMemoryMB: number;
  private readonly ttl: number;
  private currentMemoryBytes = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    maxSize = 100,
    maxMemoryMB = 50, // 50MB max memory usage
    ttlMinutes = 30, // 30 minutes TTL
  ) {
    this.maxSize = maxSize;
    this.maxMemoryMB = maxMemoryMB;
    this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Get a cached thumbnail value
   * @param key - The cache key (typically revision ID)
   * @returns The cached value or null if not found/expired
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiry) {
      this.delete(key);
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Set a thumbnail value in the cache
   * @param key - The cache key
   * @param value - The thumbnail HTML string
   */
  set(key: string, value: string): void {
    const size = this.estimateStringSize(value);
    const now = Date.now();

    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check if we need to free up space
    this.ensureCapacity(size);

    // Add new entry
    const entry: CacheEntry = {
      value,
      expiry: now + this.ttl,
      lastAccessed: now,
      size,
    };

    this.cache.set(key, entry);
    this.currentMemoryBytes += size;
  }

  /**
   * Delete a specific cache entry
   * @param key - The cache key to delete
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentMemoryBytes -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    const expired = entries.filter((entry) => now > entry.expiry).length;

    return {
      totalEntries: this.cache.size,
      expiredEntries: expired,
      memoryUsageMB:
        Math.round((this.currentMemoryBytes / (1024 * 1024)) * 100) / 100,
      maxMemoryMB: this.maxMemoryMB,
      maxEntries: this.maxSize,
    };
  }

  /**
   * Ensure we have enough capacity for a new entry
   * @param newEntrySize - Size of the new entry in bytes
   */
  private ensureCapacity(newEntrySize: number): void {
    const maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;

    // Clean up expired entries first
    this.cleanupExpired();

    // If still over capacity, remove LRU entries
    while (
      (this.cache.size >= this.maxSize) ||
      (this.currentMemoryBytes + newEntrySize > maxMemoryBytes)
    ) {
      this.removeLRUEntry();
    }
  }

  /**
   * Remove the least recently used entry
   */
  private removeLRUEntry(): void {
    if (this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.delete(key));
  }

  /**
   * Estimate the memory size of a string in bytes
   * @param str - The string to measure
   * @returns Estimated size in bytes
   */
  private estimateStringSize(str: string): number {
    // JavaScript strings are UTF-16, so each character is roughly 2 bytes
    // Add some overhead for object structure
    return (str.length * 2) + 64; // 64 bytes overhead for the cache entry object
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop periodic cleanup (for cleanup on unmount)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Create a singleton instance for the application
export const thumbnailCache = new ThumbnailCache();

// Cleanup on page unload (for better memory management)
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    thumbnailCache.destroy();
  });
}

export default thumbnailCache;
