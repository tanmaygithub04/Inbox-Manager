// Main content script for LinkedIn message processing

// Ensure Storage and UI classes are loaded if not using modules
// (Handled by manifest.json load order)

let settings = {};
let cachedClassifications = {}; // Local cache mirror
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
  console.log("InboxZen: DOMContentLoaded");
  // Load settings and cache
  await loadSettingsAndCache();

  // Add Filter Controls (only if settings loaded successfully)
  if (settings.categories && settings.categories.length > 0) {
      UI.addFilterControls(settings.categories, handleFilterSelection, handleClearFilter);
  } else {
      console.warn("InboxZen: Categories not found in settings, cannot add filter controls.");
  }

  // Set up observers
  setupMessageObserver();
  setupContentChangeObserver();
  setupNotificationObserver();
  setupReadStatusObserver();

  // Add keyboard shortcuts
  setupKeyboardShortcuts();

  // Process existing messages
  console.log('InboxZen: Initial processing of messages...');
  processMessages(true); // Pass true for initial load
});

// Load settings and validate/load cache from storage
async function loadSettingsAndCache() {
  console.log("InboxZen: Loading settings and cache...");
  try {
    // Use message passing to get settings from background script which uses Storage.js
    settings = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            if (response && response.settings) {
                resolve(response.settings);
            } else {
                reject(new Error("Failed to get settings from background script."));
            }
        });
    });

    console.log("InboxZen: Settings received:", settings);

    // Validate cache using background script's Storage logic (implicitly done via getSettings)
    // The background script should ensure cache is valid before sending it
    // Or, we could add a specific validation message if needed.
    // For now, assume the cache received is valid according to background script logic.

    // Load the cache provided by the background script
    cachedClassifications = settings.cachedClassifications || {};
    console.log(`InboxZen: Cache loaded with ${Object.keys(cachedClassifications).length} entries.`);

  } catch (error) {
    console.error('InboxZen: Error loading settings or cache:', error);
    settings = {}; // Reset settings on error
    cachedClassifications = {}; // Reset cache on error
  }
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
      console.log('InboxZen: New message notification in conversation:', convId);
      triggerConversationUpdate(conversationCard);
    }
  } else {
    // If not directly in a conversation card, it might be a global notification
    // Trigger a full refresh of all conversations after a short delay
    console.log('InboxZen: Global notification detected, will refresh all conversations');
    setTimeout(() => {
      console.log('InboxZen: Processing messages due to global notification.');
      processMessages();
    }, 2000);
  }
}

// Trigger an update for a specific conversation, waiting for content change
function triggerConversationUpdate(conversationCard) {
  if (!conversationCard) return;

  const convId = conversationCard.id;
  if (!convId) return;

  console.log(`InboxZen: Update triggered for conversation ${convId}. Checking for snippet change.`);
  waitForSnippetUpdateAndClassify(convId, 0); // Start polling for snippet update
}

// Polls for snippet changes before re-classifying
const MAX_SNIPPET_CHECK_RETRIES = 10; // Max attempts
const SNIPPET_CHECK_INTERVAL = 250; // Milliseconds between checks

function waitForSnippetUpdateAndClassify(convId, retryCount) {
  const conversationCard = document.getElementById(convId);
  if (!conversationCard) {
    console.warn(`InboxZen: Conversation card ${convId} not found during snippet check.`);
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
    console.log(`InboxZen: Snippet change detected for ${convId}. Previous: "${previousSnippet}", Current: "${currentSnippet}". Proceeding with classification.`);
    // Update the stored snippet *before* classifying
    processedSnippets.set(convId, currentSnippet);
    updateConversationCategory(convId);
  } else if (retryCount < MAX_SNIPPET_CHECK_RETRIES) {
    // Snippet hasn't changed yet, retry after interval
    console.log(`InboxZen: Snippet for ${convId} unchanged (Retry ${retryCount + 1}/${MAX_SNIPPET_CHECK_RETRIES}). Retrying in ${SNIPPET_CHECK_INTERVAL}ms.`);
    setTimeout(() => {
      waitForSnippetUpdateAndClassify(convId, retryCount + 1);
    }, SNIPPET_CHECK_INTERVAL);
  } else {
    // Max retries reached, proceed anyway but log a warning
    console.warn(`InboxZen: Snippet for ${convId} did not change after ${MAX_SNIPPET_CHECK_RETRIES} retries. Classifying with potentially old content: "${currentSnippet}"`);
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
                    console.log(`InboxZen (Content Observer): Direct snippet change observed for ${convId}. Updating.`);
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
                            console.log(`InboxZen (Content Observer): Snippet content present in newly added card ${cardId}. Triggering update.`);
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
      console.log(`InboxZen (Content Observer): Content observer forcing update for conversation: ${convId}`);
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
    console.log('InboxZen: Content change observer setup successfully');
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
      console.warn(`InboxZen: Cannot update category: Conversation card ${conversationId} not found.`);
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

  console.log(`InboxZen: Re-classifying conversation ${conversationId} with snippet: "${messageText}"`);

  // Classify the message with updated content
  classifyMessage(messageText, senderName, subject).then(category => {
    console.log(`InboxZen: Conversation ${conversationId} reclassified as: ${category}`);

    // Update local cache object
    cachedClassifications[conversationId] = category;
    console.log('InboxZen: calling update cache');
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
      console.log('InboxZen: calling process messages');
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

// Process messages in the list
// isInitialLoad: If true, only process unread messages. If false, process as usual (new/changed/cached).
async function processMessages(isInitialLoad = false) {
  const messageItems = document.querySelectorAll('.msg-conversation-card');
  console.log(`InboxZen: Processing ${messageItems.length} messages. Initial Load: ${isInitialLoad}`);

  if (messageItems.length === 0) {
    return;
  }

  for (const item of messageItems) {
    const messageId = item.getAttribute('id');
    if (!messageId) continue;

    // Check if the message is unread (has notification indicators)
    const isUnread = !!item.querySelector(`.${NOTIFICATION_INDICATORS.BADGE_CLASS}.${NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS}`) ||
                     Array.from(item.querySelectorAll(`.${NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS}`))
                       .some(el => el.textContent && el.textContent.toLowerCase().includes('new notification'));

    // --- Logic based on Initial Load vs Subsequent Load ---

    let category = null;
    let shouldClassify = false;
    let requiresCacheUpdate = false;

    if (isInitialLoad) {
      // --- Initial Load ---
      if (isUnread) {
        // Process only unread messages
        console.log(`InboxZen: Initial Load: Processing unread message ${messageId}`);
        shouldClassify = true;
      } else {
        // Skip read messages, ensure no tag
        console.log(`InboxZen: Initial Load: Skipping read message ${messageId}`);
        const existingTag = item.querySelector('.inboxzen-tag');
        if (existingTag) existingTag.remove();
        continue; // Skip to next item
      }
    } else {
      // --- Subsequent Load (e.g., triggered by observer) ---
      if (isUnread) {
        // Always re-classify unread/notified messages on subsequent loads
        console.log(`InboxZen: Subsequent Load: Processing unread/notified message ${messageId}`);
        shouldClassify = true;
      } else {
        // Read message encountered on subsequent load
        if (cachedClassifications[messageId]) {
          // Use cache if available
          category = cachedClassifications[messageId];
          console.log(`InboxZen: Subsequent Load: Using cached category for read message ${messageId}: ${category}`);
        } else {
          // Read message, not in cache - do nothing, ensure no tag
          console.log(`InboxZen: Subsequent Load: Skipping read message ${messageId} (not in cache)`);
           const existingTag = item.querySelector('.inboxzen-tag');
           if (existingTag) existingTag.remove();
          continue; // Skip applying category
        }
      }
    }

    // --- Classification (if needed) ---
    if (shouldClassify) {
      // Extract details needed for classification
      const messageText = extractMessageText(item);
      const senderName = extractSenderName(item);
      const subject = extractSubject(item);

      // Store snippet for change detection (only if classifying)
      if (messageText) {
        processedSnippets.set(messageId, messageText);
      }

      // Force re-classification by clearing cache first for reliability
      if (cachedClassifications[messageId]) {
        console.log(`InboxZen: Clearing cache for ${messageId} before re-classification.`);
        delete cachedClassifications[messageId];
      }

      category = await classifyMessage(messageText, senderName, subject);
      console.log(`InboxZen: Classified ${messageId} as: ${category}`);

      // Update cache with the new result
      cachedClassifications[messageId] = category;
      requiresCacheUpdate = true; // Mark that cache needs saving
    }

    // --- Apply UI ---
    if (category) {
      applyCategory(item, category);
    }
    // If !category (only happens if read message on subsequent load wasn't in cache), tag is already removed or wasn't there.

    // --- Update Cache in Storage (if needed) ---
    // We only call updateCache once per message that required classification/caching
    if (requiresCacheUpdate) {
      console.log('InboxZen: calling update cache');
      updateCache(); // Send the entire updated local cache to background
    }
  }
  console.log(`InboxZen: Finished processing messages. Initial Load: ${isInitialLoad}`);
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
      console.error('InboxZen: OpenAI classification failed:', error);
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
    console.error('InboxZen: OpenAI API error:', error);
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
  console.log('InboxZen: Updating cache');
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

// Set up observer to detect when messages are marked as read (by badge removal)
function setupReadStatusObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // We are interested in nodes being removed from the DOM
      if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
        mutation.removedNodes.forEach(removedNode => {
          // Check if the removed node is an element node
          if (removedNode.nodeType === Node.ELEMENT_NODE) {
            // Check if the removed node itself, or any of its descendants,
            // contains the specific notification elements.
            // We look for the 'show' class or the specific a11y text.
            const wasNotificationBadge = removedNode.classList.contains(NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS) ||
                                         removedNode.querySelector(`.${NOTIFICATION_INDICATORS.BADGE_SHOW_CLASS}`);

            const hadA11yText = (removedNode.classList.contains(NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS) && removedNode.textContent?.includes('notification')) ||
                                removedNode.querySelector(`.${NOTIFICATION_INDICATORS.ALLY_TEXT_CLASS}[data-test-notification-a11y]`);


            if (wasNotificationBadge || hadA11yText) {
              // If a notification element was removed, find the parent conversation card
              // The 'target' of the mutation is the element the node was removed from.
              const conversationCard = mutation.target.closest('.msg-conversation-card');

              if (conversationCard) {
                console.log(`InboxZen: Notification badge removed from conversation ${conversationCard.id}, marking as read.`);
                // Call the function to remove the tag and cache entry
                handleMessageRead(conversationCard);
              } else {
                 // It's possible the card itself was removed, or the structure is unexpected.
                 // We might not need to do anything here if the card is gone anyway.
                 console.log('InboxZen: Notification element removed, but parent conversation card not found directly from mutation target.');
              }
            }
          }
        });
      }
    }
  });

  // Start observing the container where messages appear
  const messagesContainer = document.querySelector('.msg-conversations-container');
  if (messagesContainer) {
    observer.observe(messagesContainer, {
      childList: true, // Watch for nodes being added or removed
      subtree: true    // Watch descendants as well
    });
    console.log('InboxZen: Read status observer (badge removal) setup successfully');
  } else {
    // Retry if the container isn't found immediately
    console.warn('InboxZen: Messages container not found for read status observer, retrying...');
    setTimeout(setupReadStatusObserver, 1000);
  }
}

// Function to handle removing tags and cache for read messages (NO CHANGES NEEDED HERE)
function handleMessageRead(conversationCard) {
  if (!conversationCard) return;

  const conversationId = conversationCard.id;
  if (!conversationId) return;

  // Check if it was previously classified (has a tag or is in cache)
  const existingTag = conversationCard.querySelector('.inboxzen-tag');
  const isInCache = cachedClassifications.hasOwnProperty(conversationId);
  const isInProcessed = processedSnippets.has(conversationId);

  if (existingTag || isInCache || isInProcessed) {
    console.log(`InboxZen: Message ${conversationId} marked as read. Removing tag and cache entry.`);

    // Remove the tag from the UI
    if (existingTag) {
      existingTag.remove();
    }

    let cacheUpdated = false;
    // Remove from the local cache object
    if (isInCache) {
      delete cachedClassifications[conversationId];
      cacheUpdated = true;
    }

    // Remove from processed snippets map
    if (isInProcessed) {
        processedSnippets.delete(conversationId);
    }

    // If the cache was modified, update the storage
    if (cacheUpdated) {
      console.log('InboxZen: calling update cache');
      updateCache();
    }
  }
}

// Initial execution
setTimeout(() => {
  if (window.location.href.includes('linkedin.com/messaging')) {
    loadSettingsAndCache().then(() => {
      console.log('InboxZen: calling process messages');
      processMessages();
      setupMessageObserver();
      setupContentChangeObserver();
      setupNotificationObserver();
      setupReadStatusObserver();
      setupKeyboardShortcuts();
    });
  }
}, 1500);