// Main content script for LinkedIn message processing
let settings = {};
let cachedClassifications = {};

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings and cache
  await loadSettings();
  
  // Set up mutation observer to detect new messages
  setupMessageObserver();
  
  // Add keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Process existing messages
  processMessages();
});

// Load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response && response.settings) {
        settings = response.settings;
        cachedClassifications = settings.cachedClassifications || {};
      }
      resolve();
    });
  });
}

// Set up observer to watch for new messages being added
function setupMessageObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        shouldProcess = true;
      }
    });
    
    if (shouldProcess) {
      processMessages();
    }
  });
  
  // Start observing the message container
  const messagesContainer = document.querySelector('.msg-conversations-container');
  if (messagesContainer) {
    observer.observe(messagesContainer, { childList: true, subtree: true });
  } else {
    // If container not found, try again later
    setTimeout(setupMessageObserver, 1000);
  }
}

// Process all messages in the list
async function processMessages() {
  const messageItems = document.querySelectorAll('.msg-conversation-card');
  
  if (messageItems.length === 0) {
    return;
  }
  
  for (const item of messageItems) {
    // Skip already processed items
    if (item.hasAttribute('data-inboxzen-processed')) {
      continue;
    }
    
    // Mark as processed
    item.setAttribute('data-inboxzen-processed', 'true');
    
    // Check if this is an unread message (from someone else)
    const isUnread = item.querySelector('.msg-conversation-card__unread-count');
    if (!isUnread) {
      // Skip messages that have been read or are sent by you
      continue;
    }
    
    // Get message info
    const messageId = item.getAttribute('id');
    const messageText = extractMessageText(item);
    const senderName = extractSenderName(item);
    const subject = extractSubject(item);
    
    // Check if we have a cached classification
    let category = null;
    if (cachedClassifications[messageId]) {
      category = cachedClassifications[messageId];
    } else {
      // Classify the message
      category = await classifyMessage(messageText, senderName, subject);
      
      // Cache the result
      cachedClassifications[messageId] = category;
      updateCache();
    }
    
    // Apply UI changes
    applyCategory(item, category);
  }
}

// Extract message text from a conversation card
function extractMessageText(messageItem) {
  const contentElement = messageItem.querySelector('.msg-conversation-card__message-snippet-body');
  return contentElement ? contentElement.textContent.trim() : '';
}

// Extract sender name from a conversation card
function extractSenderName(messageItem) {
  const nameElement = messageItem.querySelector('.msg-conversation-card__participant-names');
  return nameElement ? nameElement.textContent.trim() : '';
}

// Extract subject from a conversation card
function extractSubject(messageItem) {
  const subjectElement = messageItem.querySelector('.msg-conversation-card__message-snippet');
  return subjectElement ? subjectElement.textContent.trim() : '';
}

// Classify a message using available methods
async function classifyMessage(text, sender, subject) {
  // Combine all text for classification
  const fullText = `${sender} ${subject} ${text}`.toLowerCase();
  
  // Local rules-based classification
  if (fullText.includes('job') || fullText.includes('position') || 
      fullText.includes('opportunity') || fullText.includes('hiring') || 
      fullText.includes('recruiter') || fullText.includes('career')) {
    return 'Job Offers';
  }
  
  if (fullText.includes('connect') || fullText.includes('network') || 
      fullText.includes('introduction') || fullText.includes('meet')) {
    return 'Networking';
  }
  
  if (fullText.includes('buy') || fullText.includes('demo') || 
      fullText.includes('product') || fullText.includes('service') ||
      fullText.includes('offer') || fullText.includes('sale') ||
      fullText.includes('discount')) {
    return 'Sales';
  }
  
  if (fullText.includes('congratulation') || fullText.includes('lottery') || 
      fullText.includes('winner') || fullText.includes('gift') ||
      fullText.includes('free')) {
    return 'Spam';
  }
  
  // If local rules inconclusive and OpenAI is enabled, use API
  if (settings.useAI && settings.apiKey) {
    try {
      const aiCategory = await classifyWithOpenAI(fullText);
      return aiCategory;
    } catch (error) {
      console.error('OpenAI classification failed:', error);
    }
  }
  
  return 'Other';
}

// Classify using OpenAI API
async function classifyWithOpenAI(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a message classifier for LinkedIn. Classify the following message into exactly one of these categories: Job Offers, Networking, Sales, Spam, Other. Reply with only the category name."
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 10
      })
    });
    
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const category = data.choices[0].message.content.trim();
      
      // Validate category
      const validCategories = ['Job Offers', 'Networking', 'Sales', 'Spam', 'Other'];
      if (validCategories.includes(category)) {
        return category;
      }
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
  }
  
  return 'Other';
}

// Apply category to a message item in the UI
function applyCategory(messageItem, category) {
  // Remove any existing tags
  const existingTag = messageItem.querySelector('.inboxzen-tag');
  if (existingTag) {
    existingTag.remove();
  }
  
  // Create category tag
  const tag = document.createElement('div');
  tag.className = 'inboxzen-tag';
  tag.textContent = category;
  
  // Set color based on category
  switch(category) {
    case 'Job Offers':
      tag.style.backgroundColor = '#0a66c2'; // LinkedIn blue
      break;
    case 'Networking':
      tag.style.backgroundColor = '#057642'; // Green
      break;
    case 'Sales':
      tag.style.backgroundColor = '#b24020'; // Orange-red
      break;
    case 'Spam':
      tag.style.backgroundColor = '#8f5849'; // Brown
      break;
    default:
      tag.style.backgroundColor = '#666666'; // Gray
  }
  
  // Apply general styles
  tag.style.color = 'white';
  tag.style.padding = '2px 8px';
  tag.style.borderRadius = '10px';
  tag.style.fontSize = '12px';
  tag.style.fontWeight = 'bold';
  tag.style.display = 'inline-block';
  tag.style.marginLeft = '8px';
  
  // Add the tag to the message
  const titleElement = messageItem.querySelector('.msg-conversation-card__row');
  if (titleElement) {
    titleElement.appendChild(tag);
  }
}

// Update classification cache
function updateCache() {
  chrome.runtime.sendMessage({
    action: 'updateCache',
    cache: cachedClassifications
  });
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Only respond to Ctrl+ combinations
    if (!event.ctrlKey) return;
    
    let targetCategory = null;
    
    switch(event.key) {
      case 'j':
        targetCategory = 'Job Offers';
        break;
      case 'n':
        targetCategory = 'Networking';
        break;
      case 's':
        targetCategory = 'Sales';
        break;
      case 'p':
        targetCategory = 'Spam';
        break;
      case 'o':
        targetCategory = 'Other';
        break;
    }
    
    if (targetCategory) {
      filterMessagesByCategory(targetCategory);
    }
  });
}

// Filter messages by category
function filterMessagesByCategory(category) {
  const messageItems = document.querySelectorAll('.msg-conversation-card');
  
  messageItems.forEach(item => {
    const tag = item.querySelector('.inboxzen-tag');
    if (tag && tag.textContent === category) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
  
  // Add filter indicator to UI
  addFilterIndicator(category);
}

// Add filter indicator to UI
function addFilterIndicator(category) {
  // Remove existing indicator
  const existingIndicator = document.querySelector('.inboxzen-filter-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  // Create new indicator
  const indicator = document.createElement('div');
  indicator.className = 'inboxzen-filter-indicator';
  indicator.textContent = `Filtered: ${category}`;
  indicator.style.backgroundColor = '#f3f6f8';
  indicator.style.color = '#0a66c2';
  indicator.style.padding = '8px 16px';
  indicator.style.margin = '8px';
  indicator.style.borderRadius = '4px';
  indicator.style.fontSize = '14px';
  indicator.style.fontWeight = 'bold';
  indicator.style.textAlign = 'center';
  indicator.style.cursor = 'pointer';
  
  // Add clear button
  indicator.addEventListener('click', () => {
    // Clear filter
    const messageItems = document.querySelectorAll('.msg-conversation-card');
    messageItems.forEach(item => {
      item.style.display = '';
    });
    // Remove indicator
    indicator.remove();
  });
  
  // Add to page
  const headerElement = document.querySelector('.msg-overlay-list-bubble__header');
  if (headerElement) {
    headerElement.insertAdjacentElement('afterend', indicator);
  }
}

// Initial execution
setTimeout(() => {
  if (window.location.href.includes('linkedin.com/messaging')) {
    loadSettings().then(() => {
      processMessages();
      setupMessageObserver();
      setupKeyboardShortcuts();
    });
  }
}, 1500);