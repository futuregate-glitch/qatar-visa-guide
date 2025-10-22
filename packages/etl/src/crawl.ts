#!/usr/bin/env node
import { PoliteCrawler } from './crawler';
import { DatabaseLoader } from './loader';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
  name: 'etl',
});

// Seed URLs for Qatar visa guide
const SEED_URLS = [
  'https://www.visaguideqatar.com/',
  'https://www.visaguideqatar.com/visas/',
  'https://www.visaguideqatar.com/work-visa/',
  'https://www.visaguideqatar.com/family-visa/',
  'https://www.visaguideqatar.com/business-visa/',
  'https://www.visaguideqatar.com/tourist-visa/',
  'https://www.visaguideqatar.com/residence-permit/',
  'https://www.visaguideqatar.com/visa-extension/',
  'https://www.visaguideqatar.com/visa-renewal/',
];

async function runETL() {
  const startTime = Date.now();
  logger.info('Starting ETL pipeline...');

  const crawler = new PoliteCrawler({
    baseUrl: 'https://www.visaguideqatar.com',
    maxDepth: 3,
    maxPages: 100,
    delayMin: 500,
    delayMax: 1500,
    respectRobotsTxt: true,
  });

  const loader = new DatabaseLoader();

  try {
    // Initialize crawler
    await crawler.initialize();
    logger.info('Crawler initialized');

    // Seed with initial URLs
    await crawler.seed(SEED_URLS);
    logger.info({ count: SEED_URLS.length }, 'Seeded crawler with URLs');

    // Crawl pages
    logger.info('Starting crawl...');
    const crawledPages = await crawler.crawl();
    logger.info({ count: crawledPages.length }, 'Crawl completed');

    // Load pages into database
    logger.info('Loading pages into database...');
    let successCount = 0;
    let errorCount = 0;

    for (const page of crawledPages) {
      try {
        await loader.loadPage(page);
        successCount++;
        logger.info({
          url: page.url,
          progress: `${successCount}/${crawledPages.length}`,
        }, 'Loaded page');
      } catch (error: any) {
        errorCount++;
        logger.error({
          url: page.url,
          error: error.message,
        }, 'Failed to load page');
      }
    }

    // Get stats
    const stats = await loader.getStats();
    const duration = (Date.now() - startTime) / 1000;

    logger.info({
      duration: `${duration.toFixed(2)}s`,
      crawled: crawledPages.length,
      loaded: successCount,
      errors: errorCount,
      ...stats,
    }, 'ETL pipeline completed');

  } catch (error: any) {
    logger.error({ error: error.message }, 'ETL pipeline failed');
    process.exit(1);
  } finally {
    await crawler.shutdown();
  }
}

// CLI
const command = process.argv[2];

if (command === 'run' || !command) {
  runETL().catch(error => {
    logger.error({ error: error.message }, 'Fatal error');
    process.exit(1);
  });
} else if (command === 'stats') {
  const loader = new DatabaseLoader();
  loader.getStats().then(stats => {
    console.log('Database Statistics:');
    console.log(JSON.stringify(stats, null, 2));
  });
} else {
  console.log('Usage:');
  console.log('  npm run crawl -- run    # Run full ETL pipeline');
  console.log('  npm run crawl -- stats  # Show database statistics');
}
