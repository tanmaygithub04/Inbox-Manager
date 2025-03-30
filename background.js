// Import the Storage class (assuming it's accessible in the service worker context)
// If using modules isn't straightforward in your setup, ensure Storage is globally available
// For service workers, top-level import should work if Storage.js is structured correctly (no default export needed if not using modules)
// import { Storage } from './lib/storage.js'; // Adjust path if needed

// Ensure Storage class is loaded if not using modules
if (typeof Storage === 'undefined') {
    importScripts('./lib/storage.js'); // Load storage script if needed
}

// Listen for installation
chrome.runtime.onInstalled.addListener(async () => {
    await Storage.initializeDefaults();
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Use a flag to indicate if the response will be asynchronous
  let isAsync = false;

  (async () => {
    try {
      if (request.action === 'getSettings') {
        const data = await Storage.getAll();
        sendResponse({ settings: data });
      } else if (request.action === 'updateCacheEntry') {
        isAsync = true; // Mark as async
        console.log(`Background: Received updateCacheEntry for ${request.conversationId}`);
        await Storage.updateCacheEntry(request.conversationId, request.category);
        sendResponse({ success: true });
      } else if (request.action === 'deleteCacheEntry') {
        isAsync = true; // Mark as async
        console.log(`Background: Received deleteCacheEntry for ${request.conversationId}`);
        await Storage.deleteCacheEntry(request.conversationId);
        sendResponse({ success: true });
      } else if (request.action === 'clearCache') {
        isAsync = true; // Mark as async
        console.log('Background: Received clearCache request');
        await Storage.clearCache();
        sendResponse({ success: true });
      } else {
        // Handle unknown actions if necessary
        console.log("Background: Received unknown action:", request.action);
        // sendResponse({ success: false, error: 'Unknown action' }); // Optional: respond for unknown actions
      }
    } catch (error) {
      console.error(`Background: Error processing action ${request.action}:`, error);
      // Ensure response is sent even on error for async cases
      if (isAsync) {
        sendResponse({ success: false, error: error.message });
      }
    }
  })(); // Immediately invoke the async function

  // Return true *only* if we explicitly marked the operation as async
  return isAsync;
});