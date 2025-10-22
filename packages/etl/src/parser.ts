import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { PageData, createSlug } from '@qatar-visa/shared';
import pino from 'pino';

const logger = pino({ name: 'parser' });

export interface ParsedVisaData {
  visaType: {
    name: string;
    category?: string;
    purpose?: string;
    audience?: string;
  };
  eligibility: Array<{ criterion: string }>;
  documents: Array<{ docName: string; notes?: string }>;
  fees: Array<{ feeName: string; amount?: number; currency?: string; notes?: string }>;
  processingTimes: Array<{ timelineLabel: string; minDays?: number; maxDays?: number; notes?: string }>;
  steps: Array<{ stepOrder: number; stepTitle: string; stepDetail: string }>;
  externalLinks: Array<{ linkTitle: string; linkUrl: string }>;
}

export class VisaContentParser {
  private $: CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  /**
   * Parse complete page data
   */
  parse(): Partial<PageData> | null {
    try {
      const title = this.extractTitle();
      if (!title) {
        logger.warn('No title found, skipping page');
        return null;
      }

      const summary = this.extractSummary();
      const contentText = this.extractContentText();
      const contentMarkup = this.extractContentMarkup();
      const lastUpdatedOn = this.extractLastUpdated();

      const visaTypes = this.extractVisaTypes();

      return {
        title,
        slug: createSlug(title),
        summary,
        lastUpdatedOn,
        contentText,
        contentMarkup,
        visaTypes: visaTypes.map(vt => ({
          name: vt.visaType.name,
          category: vt.visaType.category,
          purpose: vt.visaType.purpose,
          audience: vt.visaType.audience,
          isActive: true,
          eligibility: vt.eligibility,
          documents: vt.documents,
          fees: vt.fees,
          processingTimes: vt.processingTimes,
          steps: vt.steps,
          externalLinks: vt.externalLinks,
        })),
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error parsing page');
      return null;
    }
  }

  /**
   * Extract page title
   */
  private extractTitle(): string {
    // Try h1 first, then title tag
    let title = this.$('h1').first().text().trim();
    if (!title) {
      title = this.$('title').text().trim();
    }
    return this.cleanText(title);
  }

  /**
   * Extract summary/description
   */
  private extractSummary(): string | undefined {
    // Try meta description
    let summary = this.$('meta[name="description"]').attr('content');
    
    if (!summary) {
      // Try first paragraph
      summary = this.$('p').first().text().trim();
    }

    if (summary && summary.length > 2000) {
      summary = summary.substring(0, 1997) + '...';
    }

    return summary ? this.cleanText(summary) : undefined;
  }

  /**
   * Extract full content as text
   */
  private extractContentText(): string {
    // Remove scripts, styles, nav, footer
    const $ = this.$;
    $('script, style, nav, footer, .ads, .advertisement').remove();
    
    const text = $('body').text();
    return this.cleanText(text);
  }

  /**
   * Extract content as markup (for display)
   */
  private extractContentMarkup(): string | undefined {
    const $ = this.$;
    const content = $('.content, .article, main, .post').first();
    
    if (content.length) {
      return content.html() || undefined;
    }

    return undefined;
  }

  /**
   * Extract last updated date
   */
  private extractLastUpdated(): Date | undefined {
    const $ = this.$;
    
    // Look for common date patterns
    const dateSelectors = [
      'time[datetime]',
      '.updated, .modified, .last-updated',
      'meta[property="article:modified_time"]',
      'meta[name="last-modified"]',
    ];

    for (const selector of dateSelectors) {
      const elem = $(selector).first();
      if (elem.length) {
        const dateStr = elem.attr('datetime') || elem.attr('content') || elem.text();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract visa type information
   */
  private extractVisaTypes(): ParsedVisaData[] {
    const results: ParsedVisaData[] = [];
    const $ = this.$;

    // Primary visa type from page title
    const title = this.extractTitle();
    const visaData = this.extractVisaDataFromContent();

    results.push({
      visaType: {
        name: title,
        category: this.categorizeVisa(title),
        purpose: this.extractPurpose(title),
      },
      ...visaData,
    });

    return results;
  }

  /**
   * Extract structured visa data from content
   */
  private extractVisaDataFromContent(): Omit<ParsedVisaData, 'visaType'> {
    return {
      eligibility: this.extractEligibility(),
      documents: this.extractDocuments(),
      fees: this.extractFees(),
      processingTimes: this.extractProcessingTimes(),
      steps: this.extractSteps(),
      externalLinks: this.extractExternalLinks(),
    };
  }

  /**
   * Extract eligibility criteria
   */
  private extractEligibility(): Array<{ criterion: string }> {
    const criteria: Array<{ criterion: string }> = [];
    const $ = this.$;

    // Find eligibility section
    const sections = this.findSectionsByHeading(['eligibility', 'requirements', 'who can apply']);

    sections.each((_, elem) => {
      const section = $(elem);
      
      // Extract list items
      section.find('li, p').each((_, item) => {
        const text = this.cleanText($(item).text());
        if (text.length > 10 && text.length <= 2000) {
          criteria.push({ criterion: text });
        }
      });
    });

    return criteria;
  }

  /**
   * Extract required documents
   */
  private extractDocuments(): Array<{ docName: string; notes?: string }> {
    const documents: Array<{ docName: string; notes?: string }> = [];
    const $ = this.$;

    const sections = this.findSectionsByHeading(['required documents', 'documents needed', 'documentation']);

    sections.each((_, elem) => {
      const section = $(elem);
      
      section.find('li, p').each((_, item) => {
        const text = this.cleanText($(item).text());
        if (text.length > 5 && text.length <= 500) {
          // Try to split document name and notes
          const parts = text.split(/[:-]/);
          const docName = parts[0].trim();
          const notes = parts.length > 1 ? parts.slice(1).join(':').trim() : undefined;
          
          documents.push({ docName, notes });
        }
      });
    });

    return documents;
  }

  /**
   * Extract fees
   */
  private extractFees(): Array<{ feeName: string; amount?: number; currency?: string; notes?: string }> {
    const fees: Array<{ feeName: string; amount?: number; currency?: string; notes?: string }> = [];
    const $ = this.$;

    const sections = this.findSectionsByHeading(['fees', 'cost', 'charges', 'price']);

    sections.each((_, elem) => {
      const section = $(elem);
      const text = section.text();

      // Extract currency amounts (QAR, QR, etc.)
      const feePattern = /(\d+(?:,\d+)*(?:\.\d+)?)\s*(QAR|QR|Qatari\s*Riyal)/gi;
      const matches = text.matchAll(feePattern);

      for (const match of matches) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const currency = 'QAR';
        
        // Try to find fee name in surrounding text
        const fullText = match.input || '';
        const index = match.index || 0;
        const before = fullText.substring(Math.max(0, index - 50), index).trim();
        const feeName = before.split(/[:.]/). pop()?.trim() || 'Visa Fee';

        fees.push({ feeName, amount, currency });
      }
    });

    // If no fees found, add a placeholder
    if (fees.length === 0) {
      const text = $('body').text();
      if (/free|no fee|free of charge/i.test(text)) {
        fees.push({ feeName: 'Application Fee', amount: 0, currency: 'QAR', notes: 'Free of charge' });
      }
    }

    return fees;
  }

  /**
   * Extract processing times
   */
  private extractProcessingTimes(): Array<{ timelineLabel: string; minDays?: number; maxDays?: number; notes?: string }> {
    const times: Array<{ timelineLabel: string; minDays?: number; maxDays?: number; notes?: string }> = [];
    const $ = this.$;

    const sections = this.findSectionsByHeading(['processing time', 'timeline', 'duration', 'how long']);
    const text = sections.text() || $('body').text();

    // Pattern: "X days", "X-Y days", "X to Y days", "X weeks"
    const timePatterns = [
      /(\d+)\s*(?:to|-)\s*(\d+)\s*(days?|weeks?|months?|business\s*days?)/gi,
      /(\d+)\s*(days?|weeks?|months?|business\s*days?)/gi,
    ];

    for (const pattern of timePatterns) {
      const matches = text.matchAll(pattern);
      
      for (const match of matches) {
        let minDays: number | undefined;
        let maxDays: number | undefined;
        const unit = match[match.length - 1].toLowerCase();

        if (match[2] && /days?|weeks?|months?/.test(match[2])) {
          // Range pattern
          minDays = parseInt(match[1]);
          maxDays = parseInt(match[2]);
        } else {
          // Single value pattern
          minDays = maxDays = parseInt(match[1]);
        }

        // Convert to days
        if (unit.includes('week')) {
          minDays = minDays ? minDays * 7 : undefined;
          maxDays = maxDays ? maxDays * 7 : undefined;
        } else if (unit.includes('month')) {
          minDays = minDays ? minDays * 30 : undefined;
          maxDays = maxDays ? maxDays * 30 : undefined;
        }

        times.push({
          timelineLabel: 'Processing Time',
          minDays,
          maxDays,
          notes: match[0],
        });
      }
    }

    return times;
  }

  /**
   * Extract step-by-step process
   */
  private extractSteps(): Array<{ stepOrder: number; stepTitle: string; stepDetail: string }> {
    const steps: Array<{ stepOrder: number; stepTitle: string; stepDetail: string }> = [];
    const $ = this.$;

    const sections = this.findSectionsByHeading(['how to apply', 'application process', 'steps', 'procedure']);

    sections.each((_, elem) => {
      const section = $(elem);
      
      // Look for ordered or unordered lists
      section.find('ol li, ul li').each((index, item) => {
        const text = this.cleanText($(item).text());
        
        if (text.length > 10) {
          // Try to split into title and detail
          const parts = text.split(/[:.]/);
          const stepTitle = parts[0].trim();
          const stepDetail = parts.length > 1 ? parts.slice(1).join(':').trim() : text;

          steps.push({
            stepOrder: index + 1,
            stepTitle: stepTitle.substring(0, 500),
            stepDetail,
          });
        }
      });

      // If no lists found, try numbered paragraphs
      if (steps.length === 0) {
        section.find('p').each((index, item) => {
          const text = this.cleanText($(item).text());
          
          if (/^(\d+[\.)]\s*|step\s*\d+)/i.test(text) && text.length > 10) {
            const cleaned = text.replace(/^(\d+[\.)]\s*|step\s*\d+[:\s]*)/i, '');
            steps.push({
              stepOrder: index + 1,
              stepTitle: cleaned.substring(0, 100),
              stepDetail: cleaned,
            });
          }
        });
      }
    });

    return steps;
  }

  /**
   * Extract external links (official forms, government sites)
   */
  private extractExternalLinks(): Array<{ linkTitle: string; linkUrl: string }> {
    const links: Array<{ linkTitle: string; linkUrl: string }> = [];
    const $ = this.$;

    // Look for government and official links
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      const text = this.cleanText($(elem).text());

      if (href && this.isOfficialLink(href) && text.length > 0) {
        try {
          const url = new URL(href, 'https://www.visaguideqatar.com');
          links.push({
            linkTitle: text.substring(0, 500),
            linkUrl: url.href,
          });
        } catch {
          // Invalid URL, skip
        }
      }
    });

    return links;
  }

  /**
   * Check if link is to an official/government site
   */
  private isOfficialLink(url: string): boolean {
    const officialPatterns = [
      /\.gov\.qa/i,
      /moi\.gov\.qa/i,
      /hukoomi\.qa/i,
      /portal\.www\.gov\.qa/i,
      /mol\.gov\.qa/i,
    ];

    return officialPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Find sections by heading text
   */
  private findSectionsByHeading(keywords: string[]): cheerio.Cheerio {
    const $ = this.$;
    let sections = $();

    for (const keyword of keywords) {
      const headings = $('h1, h2, h3, h4').filter((_, elem) => {
        const text = $(elem).text().toLowerCase();
        return text.includes(keyword.toLowerCase());
      });

      headings.each((_, heading) => {
        // Get content until next heading
        const nextHeading = $(heading).nextUntil('h1, h2, h3, h4');
        sections = sections.add(nextHeading);
      });
    }

    return sections;
  }

  /**
   * Categorize visa based on title
   */
  private categorizeVisa(title: string): string | undefined {
    const titleLower = title.toLowerCase();

    if (/work|employment|labor|job/.test(titleLower)) return 'work';
    if (/family|spouse|dependent|child/.test(titleLower)) return 'family';
    if (/business|commercial|entrepreneur/.test(titleLower)) return 'business';
    if (/tourist|visit|tourism/.test(titleLower)) return 'tourist';
    if (/student|study|education/.test(titleLower)) return 'student';
    if (/residence|residency|permanent/.test(titleLower)) return 'residence';
    if (/transit/.test(titleLower)) return 'transit';

    return 'other';
  }

  /**
   * Extract purpose from title
   */
  private extractPurpose(title: string): string | undefined {
    const titleLower = title.toLowerCase();

    if (/employment|work/.test(titleLower)) return 'employment';
    if (/family/.test(titleLower)) return 'family_reunion';
    if (/business/.test(titleLower)) return 'business_visit';
    if (/tourism|tourist/.test(titleLower)) return 'tourism';
    if (/education|study/.test(titleLower)) return 'education';

    return undefined;
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
  }
}
