import { isVisaRelatedUrl, hasVisaKeywords, EXCLUDE_URL_PATTERNS } from '@qatar-visa/shared';
import { CheerioAPI } from 'cheerio';
import pino from 'pino';

const logger = pino({ name: 'classifier' });

export interface ClassificationResult {
  isRelevant: boolean;
  confidence: number;
  reasons: string[];
}

/**
 * Classifies a URL and page content to determine if it's immigration/visa related
 */
export class PageClassifier {
  /**
   * Quick URL-based classification (before fetching)
   */
  static classifyUrl(url: string): ClassificationResult {
    const reasons: string[] = [];
    let score = 0;

    // Check URL patterns
    if (isVisaRelatedUrl(url)) {
      score += 50;
      reasons.push('URL contains visa/immigration keywords');
    }

    // Check exclusion patterns
    for (const pattern of EXCLUDE_URL_PATTERNS) {
      if (pattern.test(url)) {
        score -= 100;
        reasons.push(`URL matches exclusion pattern: ${pattern}`);
        break;
      }
    }

    return {
      isRelevant: score > 0,
      confidence: Math.min(Math.max(score / 100, 0), 1),
      reasons,
    };
  }

  /**
   * Deep content-based classification (after fetching)
   */
  static classifyContent($: CheerioAPI, url: string): ClassificationResult {
    const reasons: string[] = [];
    let score = 0;

    // Start with URL classification
    const urlClass = this.classifyUrl(url);
    score += urlClass.confidence * 30;
    reasons.push(...urlClass.reasons);

    // Check page title
    const title = $('title').text() || $('h1').first().text();
    if (hasVisaKeywords(title)) {
      score += 20;
      reasons.push('Title contains visa keywords');
    }

    // Check meta description
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    if (hasVisaKeywords(metaDesc)) {
      score += 15;
      reasons.push('Meta description contains visa keywords');
    }

    // Check headings (h1, h2, h3)
    const headings = $('h1, h2, h3')
      .map((_, el) => $(el).text())
      .get()
      .join(' ');
    
    if (hasVisaKeywords(headings)) {
      score += 20;
      reasons.push('Headings contain visa keywords');
    }

    // Look for specific visa-related sections
    const visaSectionIndicators = [
      'eligibility',
      'required documents',
      'application process',
      'visa fee',
      'processing time',
      'how to apply',
      'visa types',
      'residence permit',
    ];

    const contentLower = $('body').text().toLowerCase();
    const foundIndicators = visaSectionIndicators.filter(indicator =>
      contentLower.includes(indicator)
    );

    if (foundIndicators.length >= 3) {
      score += 30;
      reasons.push(`Found ${foundIndicators.length} visa section indicators`);
    } else if (foundIndicators.length > 0) {
      score += foundIndicators.length * 5;
      reasons.push(`Found ${foundIndicators.length} visa section indicators`);
    }

    // Check for government/official links
    const hasOfficialLinks = $('a[href*="gov.qa"], a[href*="moi.gov.qa"], a[href*="hukoomi.qa"]').length > 0;
    if (hasOfficialLinks) {
      score += 10;
      reasons.push('Contains links to official government sites');
    }

    // Penalize if it looks like general news/tourism
    const tourismKeywords = ['hotel', 'restaurant', 'shopping', 'tourism', 'sightseeing', 'attractions'];
    const tourismCount = tourismKeywords.filter(kw => contentLower.includes(kw)).length;
    if (tourismCount >= 3) {
      score -= 20;
      reasons.push('Contains significant tourism-related content');
    }

    // Normalize score to 0-100
    const normalizedScore = Math.min(Math.max(score, 0), 100);

    return {
      isRelevant: normalizedScore >= 40,
      confidence: normalizedScore / 100,
      reasons,
    };
  }

  /**
   * Log classification decision
   */
  static logClassification(url: string, result: ClassificationResult): void {
    logger.info({
      url,
      isRelevant: result.isRelevant,
      confidence: result.confidence,
      reasons: result.reasons,
    }, 'Page classification');
  }
}
