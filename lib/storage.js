// Storage management for InboxZen

class Storage {
  // Get all settings
  static async getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        resolve(data);
      });
    });
  }
  
  // Get specific setting
  static async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (data) => {
        resolve(data[key]);
      });
    });
  }
  
  // Save setting
  static async set(key, value) {
    return new Promise((resolve) => {
      const data = {};
      data[key] = value;
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }
  
  // Get cached classifications
  static async getCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get('cachedClassifications', (data) => {
        resolve(data.cachedClassifications || {});
      });
    });
  }
  
  // Update cache with new classifications
  static async updateCache(newEntries) {
    return new Promise((resolve) => {
      chrome.storage.local.get('cachedClassifications', (data) => {
        const existingCache = data.cachedClassifications || {};
        const updatedCache = { ...existingCache, ...newEntries };
        
        chrome.storage.local.set({ cachedClassifications: updatedCache }, () => {
          resolve(updatedCache);
        });
      });
    });
  }
  
  // Clear classifications cache
  static async clearCache() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ cachedClassifications: {} }, () => {
        resolve();
      });
    });
  }
}

// Export for use in other modules
export default Storage;