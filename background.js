// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    // Initialize default settings
    chrome.storage.local.set({
      categories: ['Job Offers', 'Networking', 'Sales', 'Spam', 'Other'],
      apiKey: '',
      useAI: false,
      cachedClassifications: {},
      cacheVersion: 1.3, // Increment version to force cache refresh with notification support
      cacheExpiry: Date.now() + 604800000 // 7 days
    });
    console.log('Extension installed, settings initialized');
  });
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSettings') {
      chrome.storage.local.get(null, (data) => {
        sendResponse({ settings: data });
      });
      return true; // Required for async sendResponse
    }
    
    if (request.action === 'updateCache') {
      console.log('Updating cache with data from content script');
      chrome.storage.local.get('cachedClassifications', (data) => {
        const cache = data.cachedClassifications || {};
        const updatedCache = { ...cache, ...request.cache };
        
        chrome.storage.local.set({ cachedClassifications: updatedCache }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }
    
    // Handle cache clearing
    if (request.action === 'clearCache') {
      chrome.storage.local.set({ 
        cachedClassifications: {},
        cacheExpiry: Date.now() + 604800000 // 7 days
      }, () => {
        sendResponse({ success: true });
      });
      return true;
    }
  });