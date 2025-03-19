// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    // Initialize default settings
    chrome.storage.local.set({
      categories: ['Job Offers', 'Networking', 'Sales', 'Spam', 'Other'],
      apiKey: '',
      useAI: false,
      cachedClassifications: {}
    });
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
      chrome.storage.local.get('cachedClassifications', (data) => {
        const cache = data.cachedClassifications || {};
        const updatedCache = { ...cache, ...request.cache };
        
        chrome.storage.local.set({ cachedClassifications: updatedCache }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }
  });