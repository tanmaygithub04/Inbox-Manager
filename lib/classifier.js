// Local message classifier for InboxZen

class LocalClassifier {
  constructor() {
    // Keywords for each category
    this.keywords = {
      'Job Offers': [
        'job', 'position', 'opportunity', 'hiring', 'recruiter', 
        'career', 'employment', 'role', 'opening', 'vacancy',
        'interview', 'application', 'applicant', 'resume', 'cv'
      ],
      'Networking': [
        'connect', 'network', 'introduction', 'meet', 'coffee',
        'chat', 'catch up', 'introduction', 'referred', 'mutual',
        'know each other', 'connection', 'group', 'community'
      ],
      'Sales': [
        'buy', 'demo', 'product', 'service', 'offer', 'sale',
        'discount', 'price', 'quote', 'solution', 'implement',
        'purchase', 'invest', 'roi', 'cost', 'subscription'
      ],
      'Spam': [
        'congratulation', 'lottery', 'winner', 'gift', 'free',
        'urgent', 'limited time', 'exclusive offer', 'guaranteed',
        'millions', 'investment opportunity', 'quick money'
      ]
    };
  }
  
  // Score message text for each category
  classify(text) {
    const normalizedText = text.toLowerCase();
    const scores = {};
    
    // Calculate score for each category
    for (const [category, words] of Object.entries(this.keywords)) {
      scores[category] = 0;
      
      for (const keyword of words) {
        if (normalizedText.includes(keyword)) {
          scores[category] += 1;
        }
      }
    }
    
    // Find category with highest score
    let maxScore = 0;
    let bestCategory = 'Other';
    
    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }
    
    // If score is too low, categorize as Other
    if (maxScore < 2) {
      return 'Other';
    }
    
    return bestCategory;
  }
}

// Export for use in other modules
export default LocalClassifier;