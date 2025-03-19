// OpenAI API integration for message classification
class OpenAIClassifier {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.endpoint = 'https://api.openai.com/v1/chat/completions';
    }
    
    // Set API key
    setApiKey(key) {
      this.apiKey = key;
    }
    
    // Classify message text
    async classify(text) {
      if (!this.apiKey) {
        throw new Error('API key not set');
      }
      
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
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
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content.trim();
        }
        
        throw new Error('Invalid API response');
      } catch (error) {
        console.error('OpenAI classification error:', error);
        throw error;
      }
    }
  }
  
  // Export for use in other modules
  export default OpenAIClassifier;