import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { PageClassifier } from './classifier';
import pino from 'pino';
import * as crypto from 'crypto';
import RobotsParser from 'robotstxt-parser';

const logger = pino({ name: 'crawler' });

export interface CrawlConfig {
  baseUrl: string;
  maxDepth: number;
  maxPages: number;
  delayMin: number; // ms
  delayMax: number; // ms
  userAgent: string;
  respectRobotsTxt: boolean;
  maxRetries: number;
  timeout: number;
}

export interface CrawledPage {
  url: string;
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  scrapedAt: Date;
  urlHash: string;
  contentHash: string;
}

const DEFAULT_CONFIG: CrawlConfig = {
  baseUrl: 'https://www.visaguideqatar.com',
  maxDepth: 3,
  maxPages: 200,
  delayMin: 500,
  delayMax: 1500,
  userAgent: 'QatarVisaGuideBot/1.0 (+https://yourapp.com/bot)',
  respectRobotsTxt: true,
  maxRetries: 3,
  timeout: 30000,
};

export class PoliteCrawler {
  private config: CrawlConfig;
  private browser: Browser | null = null;
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private robotsParser: RobotsParser | null = null;
  private crawlCount = 0;

  constructor(config: Partial<CrawlConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the crawler
   */
  async initialize(): Promise<void> {
    logger.info('Initializing crawler...');
    
    // Launch browser
    this.browser = await chromium.launch({
      headless: true,
    });

    // Load robots.txt
    if (this.config.respectRobotsTxt) {
      await this.loadRobotsTxt();
    }

    logger.info('Crawler initialized');
  }

  /**
   * Load and parse robots.txt
   */
  private async loadRobotsTxt(): Promise<void> {
    try {
      const robotsUrl = `${this.config.baseUrl}/robots.txt`;
      const response = await fetch(robotsUrl);
      
      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsParser = new RobotsParser(robotsUrl, robotsTxt);
        logger.info('Loaded robots.txt');
      } else {
        logger.warn('robots.txt not found, proceeding with caution');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load robots.txt');
    }
  }

  /**
   * Check if URL is allowed by robots.txt
   */
  private canCrawl(url: string): boolean {
    if (!this.robotsParser) return true;
    
    const allowed = this.robotsParser.isAllowed(url, this.config.userAgent);
    if (!allowed) {
      logger.warn({ url }, 'URL blocked by robots.txt');
    }
    return allowed || false;
  }

  /**
   * Normalize URL
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url, this.config.baseUrl);
      // Remove hash and some query params
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return url;
    }
  }

  /**
   * Check if URL should be crawled
   */
  private shouldCrawl(url: string): boolean {
    const normalized = this.normalizeUrl(url);
    
    // Already visited
    if (this.visited.has(normalized)) {
      return false;
    }

    // Not from same domain
    if (!normalized.startsWith(this.config.baseUrl)) {
      return false;
    }

    // Check robots.txt
    if (!this.canCrawl(normalized)) {
      return false;
    }

    // Quick URL classification
    const classification = PageClassifier.classifyUrl(normalized);
    if (!classification.isRelevant) {
      logger.debug({ url: normalized }, 'URL filtered by classifier');
      return false;
    }

    return true;
  }

  /**
   * Random delay between requests
   */
  private async randomDelay(): Promise<void> {
    const delay = Math.floor(
      Math.random() * (this.config.delayMax - this.config.delayMin) + this.config.delayMin
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(url: string, retries = 0): Promise<CrawledPage | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();
    
    try {
      logger.info({ url }, 'Crawling page');

      // Set user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': this.config.userAgent,
      });

      // Navigate with timeout
      const response = await page.goto(url, {
        timeout: this.config.timeout,
        waitUntil: 'domcontentloaded',
      });

      if (!response) {
        throw new Error('No response received');
      }

      const statusCode = response.status();
      
      // Handle error status codes
      if (statusCode >= 400) {
        logger.warn({ url, statusCode }, 'Page returned error status');
        return null;
      }

      // Get HTML content
      const html = await page.content();
      
      // Get headers
      const headers = response.headers();
      const etag = headers['etag'] || '';

      // Calculate hashes
      const urlHash = crypto.createHash('sha256').update(url).digest('hex');
      const contentHash = crypto.createHash('sha256').update(html).digest('hex');

      const crawledPage: CrawledPage = {
        url,
        html,
        statusCode,
        headers: { etag },
        scrapedAt: new Date(),
        urlHash,
        contentHash,
      };

      // Extract and queue links
      const $ = cheerio.load(html);
      const links = $('a[href]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .filter((href): href is string => !!href)
        .map(href => this.normalizeUrl(href))
        .filter(href => this.shouldCrawl(href));

      logger.debug({ url, linksFound: links.length }, 'Extracted links');

      return crawledPage;

    } catch (error: any) {
      logger.error({ url, error: error.message, retries }, 'Error crawling page');

      // Retry on transient errors
      if (retries < this.config.maxRetries && this.isTransientError(error)) {
        await this.randomDelay();
        return this.crawlPage(url, retries + 1);
      }

      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Check if error is transient (should retry)
   */
  private isTransientError(error: any): boolean {
    const transientErrors = ['timeout', 'network', 'ECONNRESET', 'ETIMEDOUT'];
    return transientErrors.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Seed crawler with initial URLs
   */
  async seed(urls: string[]): Promise<void> {
    for (const url of urls) {
      const normalized = this.normalizeUrl(url);
      if (this.shouldCrawl(normalized)) {
        this.queue.push({ url: normalized, depth: 0 });
      }
    }
    logger.info({ queueSize: this.queue.length }, 'Seeded crawler');
  }

  /**
   * Run the crawler
   */
  async crawl(): Promise<CrawledPage[]> {
    const results: CrawledPage[] = [];

    while (this.queue.length > 0 && this.crawlCount < this.config.maxPages) {
      const item = this.queue.shift();
      if (!item) break;

      const { url, depth } = item;

      // Skip if already visited
      if (this.visited.has(url)) {
        continue;
      }

      // Mark as visited
      this.visited.add(url);
      this.crawlCount++;

      // Crawl the page
      const crawledPage = await this.crawlPage(url);
      
      if (crawledPage) {
        // Validate content with deep classification
        const $ = cheerio.load(crawledPage.html);
        const classification = PageClassifier.classifyContent($, url);
        PageClassifier.logClassification(url, classification);

        if (classification.isRelevant) {
          results.push(crawledPage);
          
          // Extract and queue child links if under max depth
          if (depth < this.config.maxDepth) {
            const childLinks = $('a[href]')
              .map((_, el) => $(el).attr('href'))
              .get()
              .filter((href): href is string => !!href)
              .map(href => this.normalizeUrl(href))
              .filter(href => this.shouldCrawl(href));

            for (const link of childLinks) {
              this.queue.push({ url: link, depth: depth + 1 });
            }
          }
        } else {
          logger.info({ url }, 'Page filtered out by content classifier');
        }
      }

      // Polite delay between requests
      await this.randomDelay();
    }

    logger.info({ 
      totalCrawled: results.length,
      totalVisited: this.visited.size 
    }, 'Crawl completed');

    return results;
  }

  /**
   * Shutdown the crawler
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('Crawler shut down');
  }
}
