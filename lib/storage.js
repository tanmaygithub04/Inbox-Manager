// Storage management for InboxZen

const DEFAULT_CACHE_EXPIRY_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const CURRENT_CACHE_VERSION = 1.3; // Match the version used in background.js

class Storage {
  /**
   * Get all stored data.
   * @returns {Promise<object>} A promise that resolves with all stored data.
   */
  static async getAll() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (data) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(data);
      });
    });
  }

  /**
   * Get specific keys from storage.
   * @param {string|string[]|object|null} keys - A key, array of keys, or object to retrieve. Null retrieves all.
   * @returns {Promise<object>} A promise that resolves with the requested items.
   */
  static async get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (data) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(data);
      });
    });
  }

  /**
   * Save items to storage.
   * @param {object} items - An object containing key-value pairs to store.
   * @returns {Promise<void>} A promise that resolves when the items are saved.
   */
  static async set(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  /**
   * Get the cached classifications object.
   * @returns {Promise<object>} A promise that resolves with the cache object.
   */
  static async getCache() {
     try {
        const data = await this.get('cachedClassifications');
        return data.cachedClassifications || {};
     } catch (error) {
        console.error("Error getting cache:", error);
        return {};
     }
  }

   /**
   * Set the entire cached classifications object.
   * @param {object} cacheObject - The cache object to save.
   * @returns {Promise<void>} A promise that resolves when the cache is saved.
   */
  static async setCache(cacheObject) {
     try {
        await this.set({ cachedClassifications: cacheObject });
     } catch (error) {
        console.error("Error setting cache:", error);
     }
  }

  /**
   * Update a specific entry in the cache.
   * @param {string} conversationId - The ID of the conversation.
   * @param {string} category - The category to set.
   * @returns {Promise<void>}
   */
  static async updateCacheEntry(conversationId, category) {
    try {
      const cache = await this.getCache();
      cache[conversationId] = category;
      await this.setCache(cache);
      console.log(`Storage: Updated cache entry for ${conversationId}`);
    } catch (error) {
      console.error(`Storage: Failed to update cache entry for ${conversationId}:`, error);
    }
  }

  /**
   * Delete a specific entry from the cache.
   * @param {string} conversationId - The ID of the conversation to delete.
   * @returns {Promise<void>}
   */
  static async deleteCacheEntry(conversationId) {
    try {
      const cache = await this.getCache();
      if (cache.hasOwnProperty(conversationId)) {
        delete cache[conversationId];
        await this.setCache(cache);
        console.log(`Storage: Deleted cache entry for ${conversationId}`);
      } else {
        console.log(`Storage: Cache entry for ${conversationId} not found for deletion.`);
      }
    } catch (error) {
      console.error(`Storage: Failed to delete cache entry for ${conversationId}:`, error);
    }
  }


  /**
   * Clear the classifications cache and reset expiry.
   * @returns {Promise<void>} A promise that resolves when the cache is cleared.
   */
  static async clearCache() {
    try {
        const newExpiry = Date.now() + DEFAULT_CACHE_EXPIRY_DURATION;
        await this.set({
            cachedClassifications: {},
            cacheExpiry: newExpiry
        });
        console.log('Storage: Cache cleared and expiry reset.');
    } catch (error) {
        console.error("Storage: Failed to clear cache:", error);
    }
  }

  /**
   * Initialize default settings on installation.
   * @returns {Promise<void>}
   */
   static async initializeDefaults() {
     try {
        await this.set({
            categories: ['Job Offers', 'Networking', 'Sales', 'Spam', 'Other'],
            apiKey: '',
            useAI: false,
            cachedClassifications: {},
            cacheVersion: CURRENT_CACHE_VERSION,
            cacheExpiry: Date.now() + DEFAULT_CACHE_EXPIRY_DURATION
        });
        console.log('Storage: Extension installed, default settings initialized.');
     } catch (error) {
        console.error("Storage: Failed to initialize default settings:", error);
     }
   }

   /**
    * Checks cache validity (version and expiry) and clears if invalid.
    * @returns {Promise<boolean>} True if cache was valid, false if it was cleared.
    */
   static async validateCache() {
       try {
           const data = await this.get(['cacheVersion', 'cacheExpiry', 'cachedClassifications']);
           const storedVersion = data.cacheVersion || 1.0;
           const cacheExpiry = data.cacheExpiry || 0;
           const now = Date.now();

           if (now > cacheExpiry || storedVersion < CURRENT_CACHE_VERSION) {
               console.log(`Cache invalid (Expired: ${now > cacheExpiry}, Version mismatch: ${storedVersion < CURRENT_CACHE_VERSION}). Clearing cache.`);
               await this.clearCache(); // Clears cache and sets new expiry/version implicitly via clearCache -> set
               // Need to explicitly set the correct version after clearing
               await this.set({ cacheVersion: CURRENT_CACHE_VERSION });
               return false; // Cache was invalid and cleared
           }
           return true; // Cache is valid
       } catch (error) {
           console.error("Error validating cache:", error);
           // Assume invalid and clear as a precaution
           await this.clearCache();
           await this.set({ cacheVersion: CURRENT_CACHE_VERSION });
           return false;
       }
   }
}

// Note: No export default needed if loaded via manifest.json content_scripts