# InboxZen for LinkedIn

InboxZen is a browser extension that automatically categorizes your LinkedIn messages into user-defined categories (e.g., Job Offers, Networking, Spam, Sales) and provides filtering controls directly within LinkedIn’s messaging interface.

## Features
- **Automatic Message Classification:**  
  - Uses local regex/keyword scoring.
  - Falls back to OpenAI API (if API key is provided) for further classification.
- **Smart Message Filtering:**  
  - Dropdown filter to view messages by category.
  - Keyboard shortcuts (e.g., Ctrl+J for Job Offers, Ctrl+N for Networking).
- **Native UI Integration:**  
  - Injects custom badges and filter controls into LinkedIn’s interface.
- **Caching:**  
  - Unread messages are cached to avoid repeated classification.

## File Structure
