// Main content script for LinkedIn message processing
let settings = {};
let cachedClassifications = {};
let processedSnippets = new Map(); // Store processed message snippet texts

// Define read indicators constants
const READ_INDICATORS = {
  CLASS: 'msg-conversation-card--is-read',
  ATTR: 'data-read-timestamp',
  SELECTOR: '.msg-read-receipt'
};

// Define notification indicators constants
const NOTIFICATION_INDICATORS = {
  BADGE_CLASS: 'notification-badge',
  BADGE_SHOW_CLASS: 'notification-badge--show',
  BADGE_COUNT_CLASS: 'notification-badge__count',
  ALLY_TEXT_CLASS: 'a11y-text',
  TEXT_SELECTOR: '[data-test-notification-a11y]'
};

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings and cache
  await loadSettings();
  
  // Set up mutation observer to detect new messages
  setupMessageObserver();
  
  // Set up observer to detect message content changes
  setupContentChangeObserver();
  
  // Set up observer to detect notification badges
  setupNotificationObserver();
  
  // Add keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Process existing messages
  console.log(' calling process messages');
  processMessages();
});

// Load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response && response.settings) {
        settings = response.settings;
        
        // Check cache version and expiry
        const currentVersion = settings.cacheVersion || 1.0;
        const cacheExpiry = settings.cacheExpiry || 0;
        const now = Date.now();
        
        // If the cache has expired or the version has changed, clear it
        if (now > cacheExpiry || currentVersion > (settings.cacheVersion || 1.0)) {
          // Reset cache and set new expiry
          cachedClassifications = {};
          
          // Update settings with new expiry date (7 days from now)
          chrome.storage.local.set({
            cachedClassifications: {},
            cacheExpiry: now + 604800000, // 7 days
            cacheVersion: currentVersion
          });
        } else {
          // Otherwise use the cached classifications
          cachedClassifications = settings.cachedClassifications || {};
        }
      }
      resolve();
    });
  });
}

// Set up observer specifically to detect notification badges for new messages
function setupNotificationObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check added nodes for notification badges
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Look for notification badges
            const notificationBadges = node.classList?.contains(NOTIFICATION_INDICATORS.BADGE_CLASS) ? 
                                    [node] : 
                                    node.querySelectorAll(`.${NOTIFICATION_INDICATORS.BADGE_CLASS}`);
            
            if (notificationBadges.length > 0) {
              console.log('Notification badge detected');
              notificationBadges.forEach(badge => {
                if (badge.classList.contains(NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS)) {
                  console.log('Notification badge is showing');
                  handleNewMessageNotification(badge);
                }
              });
            }
            
            // Also check for the a11y text that says "new notification"
            const allyTexts = node.classList?.contains(NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS) ?
                           [node] :
                           node.querySelectorAll(`.${NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS}`);
            
            if (allyTexts.length > 0) {
              allyTexts.forEach(text => {
                if (text.textContent && text.textContent.includes('new notification')) {
                  console.log('New notification text detected:', text.textContent);
                  // Find related conversation card
                  const conversationCard = text.closest('.msg-conversation-card');
                  if (conversationCard) {
                    const convId = conversationCard.id;
                    if (convId) {
                      console.log('Found conversation needing update:', convId);
                      triggerConversationUpdate(conversationCard);
                    }
                  }
                }
              });
            }
          }
        });
      }
      
      // Check attribute changes for notification badges being shown
      if (mutation.type === 'attributes' && 
          mutation.attributeName === 'class' && 
          mutation.target.classList && 
          mutation.target.classList.contains(NOTIFICATION_INDICATORS.BADGE_CLASS)) {
        
        if (mutation.target.classList.contains(NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS)) {
          console.log('Notification badge shown via class change');
          handleNewMessageNotification(mutation.target);
        }
      }
    }
  });
  
  // Start observing the entire document for notification changes
  observer.observe(document.body, { 
    childList: true, 
    subtree: true, 
    attributes: true,
    attributeFilter: ['class'] 
  });
  console.log('Notification observer setup successfully');
}

// Handle new message notification
function handleNewMessageNotification(badgeElement) {
  // Check if the badge is within a conversation card
  const conversationCard = badgeElement.closest('.msg-conversation-card');
  if (conversationCard) {
    const convId = conversationCard.id;
    if (convId) {
      console.log('New message notification in conversation:', convId);
      triggerConversationUpdate(conversationCard);
    }
  } else {
    // If not directly in a conversation card, it might be a global notification
    // Trigger a full refresh of all conversations after a short delay
    console.log('Global notification detected, will refresh all conversations');
    setTimeout(() => {
      console.log(' calling process messages');
      processMessages();
    }, 2000); // Wait 2 seconds for the UI to update
  }
}

// Trigger an update for a specific conversation, waiting for content change
function triggerConversationUpdate(conversationCard) {
  if (!conversationCard) return;

  const convId = conversationCard.id;
  if (!convId) return;

  console.log(`Update triggered for conversation ${convId}. Checking for snippet change.`);
  // Start polling for snippet update
  waitForSnippetUpdateAndClassify(convId, 0); // Start with 0 retries
}

// Polls for snippet changes before re-classifying
const MAX_SNIPPET_CHECK_RETRIES = 10; // Max attempts
const SNIPPET_CHECK_INTERVAL = 250; // Milliseconds between checks

function waitForSnippetUpdateAndClassify(convId, retryCount) {
  const conversationCard = document.getElementById(convId);
  if (!conversationCard) {
    console.warn(`Conversation card ${convId} not found during snippet check.`);
    return;
  }

  const snippetElement = conversationCard.querySelector('.msg-conversation-card__message-snippet-body');
  const currentSnippet = snippetElement ? snippetElement.textContent.trim() : '';
  const previousSnippet = processedSnippets.get(convId) || ''; // Get the last known snippet

  // Conditions to proceed with classification:
  // 1. Snippet text has changed AND is not empty.
  // 2. It's the first time seeing this convo (no previous snippet) AND the current snippet is not empty.
  const hasChanged = currentSnippet !== previousSnippet && currentSnippet !== '';
  const isNewNonEmpty = !previousSnippet && currentSnippet !== '';

  if (hasChanged || isNewNonEmpty) {
    console.log(`Snippet change detected for ${convId}. Previous: "${previousSnippet}", Current: "${currentSnippet}". Proceeding with classification.`);
    // Update the stored snippet *before* classifying
    processedSnippets.set(convId, currentSnippet);
    updateConversationCategory(convId);
  } else if (retryCount < MAX_SNIPPET_CHECK_RETRIES) {
    // Snippet hasn't changed yet, retry after interval
    console.log(`Snippet for ${convId} unchanged (Retry ${retryCount + 1}/${MAX_SNIPPET_CHECK_RETRIES}). Retrying in ${SNIPPET_CHECK_INTERVAL}ms.`);
    setTimeout(() => {
      waitForSnippetUpdateAndClassify(convId, retryCount + 1);
    }, SNIPPET_CHECK_INTERVAL);
  } else {
    // Max retries reached, proceed anyway but log a warning
    console.warn(`Snippet for ${convId} did not change after ${MAX_SNIPPET_CHECK_RETRIES} retries. Classifying with potentially old content: "${currentSnippet}"`);
    // Still update the processed snippet in case it *did* change but was identical to the last recorded one
    if (currentSnippet !== '') {
        processedSnippets.set(convId, currentSnippet);
    }
    updateConversationCategory(convId);
  }
}

// Set up observer specifically to monitor message content changes
// NOTE: This observer becomes slightly less critical for *triggering* updates
// due to new messages (as the notification observer handles that),
// but it's still useful for catching manual edits or other less common updates.
// No changes needed here unless further issues arise.
function setupContentChangeObserver() {
  const observer = new MutationObserver((mutations) => {
    let conversationsToUpdate = new Set();

    for (const mutation of mutations) {
      // Try to find the conversation card
      const conversationCard = mutation.target.closest('.msg-conversation-card') ||
                              (mutation.target.classList &&
                               mutation.target.classList.contains('msg-conversation-card') ?
                               mutation.target : null);

      if (conversationCard) {
        const convId = conversationCard.id;
        if (!convId) continue;

        // Check for snippet content changes *directly observed*
        if (mutation.target.matches('.msg-conversation-card__message-snippet-body') ||
            mutation.target.parentNode.matches('.msg-conversation-card__message-snippet-body') || // Check text node changes
            (mutation.type === 'childList' && mutation.target.matches('.msg-conversation-card__message-snippet-body')))
         {
            const snippetElement = conversationCard.querySelector('.msg-conversation-card__message-snippet-body');
            if (snippetElement) {
                const currentSnippet = snippetElement.textContent.trim();
                const previousSnippet = processedSnippets.get(convId) || '';

                if (currentSnippet !== previousSnippet && currentSnippet !== '') {
                    console.log(`Direct snippet change observed for ${convId}. Updating.`);
                    processedSnippets.set(convId, currentSnippet); // Update immediately
                    conversationsToUpdate.add(convId);
                }
            }
        }

        // Check for notification badges within the conversation card (redundant with notification observer, but safe)
        const notificationBadge = conversationCard.querySelector(`.${NOTIFICATION_INDICATORS.BADGE_CLASS}.${NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS}`);
        if (notificationBadge) {
          // Let the notification observer handle the trigger via waitForSnippetUpdateAndClassify
          // console.log(`Notification badge found via content observer in conversation ${convId}`);
          // conversationsToUpdate.add(convId); // Avoid double-triggering
        }
      }

      // Also check for added/changed message snippets in DOM changes
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Find conversation cards in the added nodes
            const messageCards = node.classList &&
                                node.classList.contains('msg-conversation-card') ?
                                [node] :
                                node.querySelectorAll('.msg-conversation-card');

            messageCards.forEach(card => {
              const cardId = card.id;
              if (cardId) {
                 // Let the main processMessages or notification handler deal with newly added cards
                 // unless we specifically see a snippet change immediately after add.
                 const snippetElement = card.querySelector('.msg-conversation-card__message-snippet-body');
                 if (snippetElement) {
                    const currentSnippet = snippetElement.textContent.trim();
                    // If a card is added *with content*, process it
                    if (currentSnippet !== '') {
                        const previousSnippet = processedSnippets.get(cardId) || '';
                         if (currentSnippet !== previousSnippet) {
                            console.log(`Snippet content present in newly added card ${cardId}. Triggering update.`);
                            processedSnippets.set(cardId, currentSnippet);
                            conversationsToUpdate.add(cardId);
                        }
                    }
                 }
              }
            });
          }
        });
      }
    }

    // Update the conversations with changed content detected by *this* observer
    conversationsToUpdate.forEach(convId => {
      console.log(`Content observer forcing update for conversation: ${convId}`);
      // Use the standard update path which now includes the polling check
      const card = document.getElementById(convId);
      if(card) triggerConversationUpdate(card); // Use the main trigger function
    });
  });

  // Start observing the entire conversations list with all needed options
  const messagesContainer = document.querySelector('.msg-conversations-container');
  if (messagesContainer) {
    observer.observe(messagesContainer, {
      childList: true,
      subtree: true,
      characterData: true // Important for direct text changes in snippets
    });
    console.log('Content change observer setup successfully');
  } else {
    // If container not found, try again later
    setTimeout(setupContentChangeObserver, 1000);
  }
}

// Update a conversation's category based on new content
// This function is now called *after* waitForSnippetUpdateAndClassify confirms change or times out
function updateConversationCategory(conversationId) {
  const conversationCard = document.getElementById(conversationId);
  if (!conversationCard) {
      console.warn(`Cannot update category: Conversation card ${conversationId} not found.`);
      return;
  }

  // Local cache is already updated by the polling function or initial processing
  // Just ensure we remove the existing tag before re-classifying

  // Remove any existing category label
  const existingTag = conversationCard.querySelector('.inboxzen-tag');
  if (existingTag) {
    existingTag.remove();
  }

  // Extract the message information (using the potentially updated snippet stored in processedSnippets)
  const messageText = processedSnippets.get(conversationId) || extractMessageText(conversationCard); // Fallback just in case
  const senderName = extractSenderName(conversationCard);
  const subject = extractSubject(conversationCard); // Subject usually doesn't change mid-convo

  console.log(`Classifying conversation ${conversationId} with snippet: "${messageText}"`);

  // Classify the message with updated content
  classifyMessage(messageText, senderName, subject).then(category => {
    console.log(`Conversation ${conversationId} reclassified as: ${category}`);

    // Update local cache object
    cachedClassifications[conversationId] = category;
    console.log(' calling update cache');
    updateCache(); // Send the entire updated local cache to background

    // Update UI
    applyCategory(conversationCard, category);
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
      console.log(' calling process messages');
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
    const messageId = item.getAttribute('id');
    if (!messageId) continue;
    
    // Check for notification badges that indicate new messages
    const hasNotification = !!item.querySelector(`.${NOTIFICATION_INDICATORS.BADGE_CLASS}.${NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS}`);
    const hasNewMessageText = Array.from(item.querySelectorAll(`.${NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS}`))
      .some(el => el.textContent && el.textContent.toLowerCase().includes('new notification'));
    
    // Get current message text and store it for change detection
    const messageText = extractMessageText(item);
    const senderName = extractSenderName(item);
    const subject = extractSubject(item);
    
    // Store current snippet for future comparison
    if (messageText) {
      processedSnippets.set(messageId, messageText);
    }
    
    // Determine if we should use cache or classify again
    let category = null;
    
    // If there's a notification badge, always reclassify regardless of cache
    if (hasNotification || hasNewMessageText) {
      console.log(`Notification detected in conversation ${messageId}, forcing classification`);
      
      // Clear any existing cache for this conversation
      if (cachedClassifications[messageId]) {
        delete cachedClassifications[messageId];
      }
      
      // Classify the message
      category = await classifyMessage(messageText, senderName, subject);
      
      // Cache the new result
      cachedClassifications[messageId] = category;
      console.log(' calling update cache');
      updateCache();
      
      console.log(`Reclassified conversation ${messageId} with notification as: ${category}`);
    } 
    // Otherwise check cache first
    else if (cachedClassifications[messageId]) {
      category = cachedClassifications[messageId];
    } 
    // No cache, classify for the first time
    else {
      category = await classifyMessage(messageText, senderName, subject);
      
      // Cache the new result
      cachedClassifications[messageId] = category;
      console.log(' calling update cache');
      updateCache();
      
      console.log(`Classified message ${messageId} as: ${category}`);
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
  console.log('Updating cache');
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
      console.log(' calling process messages');
      processMessages();
      setupMessageObserver();
      setupContentChangeObserver();
      setupNotificationObserver();
      setupKeyboardShortcuts();
    });
  }
}, 1500);