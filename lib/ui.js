// UI management for InboxZen

class UI {
    // Apply category tag to a message
    static applyTag(messageElement, category) {
      // Remove existing tag
      const existingTag = messageElement.querySelector('.inboxzen-tag');
      if (existingTag) {
        existingTag.remove();
      }
      
      // Create category tag
      const tag = document.createElement('div');
      tag.className = 'inboxzen-tag';
      tag.textContent = category;
      
      // Set color based on category
      tag.style.color = 'white';
      tag.style.padding = '2px 8px';
      tag.style.borderRadius = '10px';
      tag.style.fontSize = '12px';
      tag.style.fontWeight = 'bold';
      tag.style.display = 'inline-block';
      tag.style.marginLeft = '8px';
      
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
      
      // Add to message
      const titleElement = messageElement.querySelector('.msg-conversation-card__row');
      if (titleElement) {
        titleElement.appendChild(tag);
      }
      
      return tag;
    }
    
    // Show filter UI
    static showFilter(category) {
      // Remove existing
      this.clearFilter();
      
      // Create filter indicator
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
      
      // Add clear functionality
      indicator.addEventListener('click', () => {
        this.clearFilter();
      });
      
      // Add to page
      const headerElement = document.querySelector('.msg-overlay-list-bubble__header');
      if (headerElement) {
        headerElement.insertAdjacentElement('afterend', indicator);
      }
      
      return indicator;
    }
    
    // Clear filter UI and filters
    static clearFilter() {
      // Remove indicator
      const existingIndicator = document.querySelector('.inboxzen-filter-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
      
      // Show all messages
      const messageItems = document.querySelectorAll('.msg-conversation-card');
      messageItems.forEach(item => {
        item.style.display = '';
      });
    }
    
    // Add filter control buttons to LinkedIn UI
    static addFilterControls() {
      // Check if controls already exist
      if (document.querySelector('.inboxzen-filter-controls')) {
        return;
      }
      
      // Create controls container
      const controls = document.createElement('div');
      controls.className = 'inboxzen-filter-controls';
      controls.style.display = 'flex';
      controls.style.justifyContent = 'center';
      controls.style.padding = '8px';
      controls.style.backgroundColor = '#fff';
      controls.style.borderBottom = '1px solid #e0e0e0';
      
      // Categories
      const categories = ['All', 'Job Offers', 'Networking', 'Sales', 'Spam', 'Other'];
      
      // Create buttons
      categories.forEach((category) => {
        const button = document.createElement('button');
        button.textContent = category;
        button.style.margin = '0 4px';
        button.style.padding = '4px 12px';
        button.style.border = '1px solid #0a66c2';
        button.style.borderRadius = '16px';
        button.style.backgroundColor = '#fff';
        button.style.color = '#0a66c2';
        button.style.fontWeight = 'bold';
        button.style.cursor = 'pointer';
        
        // Click handler
        button.addEventListener('click', () => {
          if (category === 'All') {
            this.clearFilter();
          } else {
            // Filter messages
            const messageItems = document.querySelectorAll('.msg-conversation-card');
            messageItems.forEach(item => {
              const tag = item.querySelector('.inboxzen-tag');
              if (tag && tag.textContent === category) {
                item.style.display = '';
              } else {
                item.style.display = 'none';
              }
            });
            
            // Show filter indicator
            this.showFilter(category);
          }
        });
        
        controls.appendChild(button);
      });
      
      // Add to page
      const listHeader = document.querySelector('.msg-overlay-list-bubble__header');
      if (listHeader) {
        listHeader.insertAdjacentElement('afterend', controls);
      }
      
      return controls;
    }
  }
  
  // Export for use in other modules
  export default UI;