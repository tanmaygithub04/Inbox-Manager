document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  // Save settings button
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Clear cache button
  document.getElementById('clearCache').addEventListener('click', clearCache);
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(null, (data) => {
    // API Key
    if (data.apiKey) {
      document.getElementById('apiKey').value = data.apiKey;
    }
    
    // Use AI
    if (data.useAI) {
      document.getElementById('useAI').checked = data.useAI;
    }
    
    // Cache count
    const cachedClassifications = data.cachedClassifications || {};
    const count = Object.keys(cachedClassifications).length;
    document.getElementById('cacheCount').textContent = count;
    
    // Show cache version and expiry if debugging elements exist
    const versionElement = document.getElementById('cacheVersion');
    if (versionElement && data.cacheVersion) {
      versionElement.textContent = data.cacheVersion;
    }
    
    const expiryElement = document.getElementById('cacheExpiry');
    if (expiryElement && data.cacheExpiry) {
      const expiryDate = new Date(data.cacheExpiry);
      expiryElement.textContent = expiryDate.toLocaleString();
    }
  });
}

// Save settings
function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const useAI = document.getElementById('useAI').checked;
  
  chrome.storage.local.set({ apiKey, useAI }, () => {
    // Show saved confirmation
    const button = document.getElementById('saveSettings');
    const originalText = button.textContent;
    button.textContent = 'Saved!';
    button.disabled = true;
    
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1500);
  });
}

// Clear cache
function clearCache() {
  // Use the message for clearing cache
  chrome.runtime.sendMessage({ action: 'clearCache' }, (response) => {
    if (response && response.success) {
      document.getElementById('cacheCount').textContent = '0';
      
      // Show cleared confirmation
      const button = document.getElementById('clearCache');
      const originalText = button.textContent;
      button.textContent = 'Cache Cleared!';
      button.disabled = true;
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);
    }
  });
}