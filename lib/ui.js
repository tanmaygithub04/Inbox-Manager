// UI management for InboxZen

class UI {
    /**
     * Apply category tag to a message element. Creates or updates the tag.
     * @param {Element} messageElement - The conversation card element.
     * @param {string} category - The category name.
     * @returns {Element|null} The created or updated tag element, or null if insertion point not found.
     */
    static applyTag(messageElement, category) {
      if (!messageElement || !category) return null;

      const TAG_CLASS = 'inboxzen-tag';
      const TITLE_SELECTOR = '.msg-conversation-card__row'; // Target for insertion

      // Remove existing tag first
      this.removeTag(messageElement);

      // Create category tag
      const tag = document.createElement('div');
      tag.className = TAG_CLASS;
      tag.textContent = category;

      // --- Base Styles ---
      tag.style.color = 'white';
      tag.style.padding = '2px 8px';
      tag.style.borderRadius = '10px';
      tag.style.fontSize = '12px';
      tag.style.fontWeight = 'bold';
      tag.style.display = 'inline-block';
      tag.style.marginLeft = '8px';
      tag.style.verticalAlign = 'middle'; // Align better with text

      // --- Category-Specific Styles ---
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
        default: // Other
          tag.style.backgroundColor = '#666666'; // Gray
      }

      // Add to message
      const titleElement = messageElement.querySelector(TITLE_SELECTOR);
      if (titleElement) {
        // Insert after the participant names for better layout
        const participantNames = titleElement.querySelector('.msg-conversation-card__participant-names');
        if (participantNames && participantNames.nextSibling) {
            titleElement.insertBefore(tag, participantNames.nextSibling);
        } else {
            titleElement.appendChild(tag); // Fallback
        }
      } else {
          console.warn("Could not find title element to append tag:", messageElement);
          return null; // Indicate failure
      }

      return tag;
    }

    /**
     * Remove the category tag from a message element.
     * @param {Element} messageElement - The conversation card element.
     */
    static removeTag(messageElement) {
        const TAG_CLASS = 'inboxzen-tag';
        const existingTag = messageElement?.querySelector(`.${TAG_CLASS}`);
        if (existingTag) {
            existingTag.remove();
        }
    }

    /**
     * Show the filter indicator bar.
     * @param {string} category - The category being filtered.
     * @param {function} clearCallback - Function to call when the indicator is clicked to clear the filter.
     * @returns {Element|null} The created indicator element or null.
     */
    static showFilterIndicator(category, clearCallback) {
      const INDICATOR_CLASS = 'inboxzen-filter-indicator';
      const HEADER_SELECTOR = '.msg-overlay-list-bubble__header';

      // Remove existing indicator first
      const existingIndicator = document.querySelector(`.${INDICATOR_CLASS}`);
      if (existingIndicator) {
        existingIndicator.remove();
      }

      // Create filter indicator
      const indicator = document.createElement('div');
      indicator.className = INDICATOR_CLASS;
      indicator.textContent = `Filtered by: ${category}`;

      // --- Styles ---
      indicator.style.backgroundColor = '#eef3f8'; // Lighter blue background
      indicator.style.color = '#0a66c2'; // LinkedIn blue text
      indicator.style.padding = '8px 16px';
      indicator.style.margin = '8px 16px 0 16px'; // Add margin
      indicator.style.borderRadius = '4px';
      indicator.style.fontSize = '13px';
      indicator.style.fontWeight = '600'; // Slightly bolder
      indicator.style.textAlign = 'center';
      indicator.style.cursor = 'pointer';
      indicator.title = 'Click to clear filter'; // Tooltip

      // Add clear functionality
      if (typeof clearCallback === 'function') {
          indicator.addEventListener('click', clearCallback);
      } else {
          console.warn("No clearCallback provided for filter indicator.");
      }


      // Add to page below the header
      const headerElement = document.querySelector(HEADER_SELECTOR);
      if (headerElement) {
        headerElement.parentNode.insertBefore(indicator, headerElement.nextSibling);
      } else {
          console.warn("Could not find header element to insert filter indicator.");
          return null;
      }

      return indicator;
    }

    /**
     * Remove the filter indicator bar.
     */
    static removeFilterIndicator() {
        const INDICATOR_CLASS = 'inboxzen-filter-indicator';
        const existingIndicator = document.querySelector(`.${INDICATOR_CLASS}`);
        if (existingIndicator) {
            existingIndicator.remove();
        }
    }

    /**
     * Show all message items.
     */
    static showAllMessages() {
        const MESSAGE_SELECTOR = '.msg-conversation-card';
        const messageItems = document.querySelectorAll(MESSAGE_SELECTOR);
        messageItems.forEach(item => {
            item.style.display = ''; // Reset display style
        });
    }

    /**
     * Filter messages by category tag.
     * @param {string} category - The category to show. If null or 'All', shows all messages.
     */
    static filterMessagesByTag(category) {
        const MESSAGE_SELECTOR = '.msg-conversation-card';
        const TAG_CLASS = 'inboxzen-tag';
        const messageItems = document.querySelectorAll(MESSAGE_SELECTOR);

        if (!category || category === 'All') {
            this.showAllMessages();
            return;
        }

        messageItems.forEach(item => {
            const tag = item.querySelector(`.${TAG_CLASS}`);
            // Show if tag exists and matches the category
            if (tag && tag.textContent === category) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Add filter control buttons to the LinkedIn UI.
     * @param {string[]} categories - Array of category names (e.g., ['Job Offers', ...]).
     * @param {function} filterCallback - Function to call when a category button is clicked (receives category name).
     * @param {function} clearCallback - Function to call when the 'All' button is clicked.
     * @returns {Element|null} The created controls container or null.
     */
    static addFilterControls(categories, filterCallback, clearCallback) {
      const CONTROLS_CLASS = 'inboxzen-filter-controls';
      const HEADER_SELECTOR = '.msg-overlay-list-bubble__header';

      // Check if controls already exist
      if (document.querySelector(`.${CONTROLS_CLASS}`)) {
        return document.querySelector(`.${CONTROLS_CLASS}`); // Return existing controls
      }

      // Create controls container
      const controls = document.createElement('div');
      controls.className = CONTROLS_CLASS;

      // --- Styles ---
      controls.style.display = 'flex';
      controls.style.flexWrap = 'wrap'; // Allow wrapping on smaller screens
      controls.style.justifyContent = 'center';
      controls.style.padding = '8px 16px';
      controls.style.backgroundColor = '#fff';
      controls.style.borderBottom = '1px solid #e0e0e0';
      controls.style.gap = '8px'; // Spacing between buttons

      // Add 'All' button first
      const allCategories = ['All', ...categories];

      // Create buttons
      allCategories.forEach((category) => {
        const button = document.createElement('button');
        button.textContent = category;
        button.setAttribute('data-category', category); // Store category for potential styling

        // --- Button Styles ---
        button.style.padding = '4px 12px';
        button.style.border = '1px solid #0a66c2';
        button.style.borderRadius = '16px';
        button.style.backgroundColor = '#fff';
        button.style.color = '#0a66c2';
        button.style.fontSize = '13px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.transition = 'background-color 0.2s, color 0.2s';

        // Hover effect (optional)
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#eef3f8';
        });
        button.addEventListener('mouseleave', () => {
             // Keep background if active? Logic needed here if we want active state styling
             if (!button.classList.contains('active')) { // Example active state check
                 button.style.backgroundColor = '#fff';
             }
        });


        // Click handler
        button.addEventListener('click', () => {
          // Basic active state styling (can be enhanced)
          document.querySelectorAll(`.${CONTROLS_CLASS} button`).forEach(btn => btn.style.backgroundColor = '#fff'); // Reset others
          button.style.backgroundColor = '#eef3f8'; // Highlight clicked

          if (category === 'All') {
            if (typeof clearCallback === 'function') {
              clearCallback();
            }
          } else {
            if (typeof filterCallback === 'function') {
              filterCallback(category);
            }
          }
        });

        controls.appendChild(button);
      });

      // Add to page below the header
      const listHeader = document.querySelector(HEADER_SELECTOR);
      if (listHeader) {
        listHeader.parentNode.insertBefore(controls, listHeader.nextSibling);
      } else {
          console.warn("Could not find header element to insert filter controls.");
          return null;
      }

      return controls;
    }
}

// Note: No export default needed if loaded via manifest.json content_scripts