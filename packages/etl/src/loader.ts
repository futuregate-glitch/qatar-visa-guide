import { db } from '@qatar-visa/database';
import { PageData } from '@qatar-visa/shared';
import { CrawledPage } from './crawler';
import { VisaContentParser } from './parser';
import * as crypto from 'crypto';
import { diffLines } from 'diff';
import pino from 'pino';

const logger = pino({ name: 'loader' });

export class DatabaseLoader {
  /**
   * Load crawled page into database
   */
  async loadPage(crawledPage: CrawledPage): Promise<void> {
    try {
      // Parse the page
      const parser = new VisaContentParser(crawledPage.html);
      const pageData = parser.parse();

      if (!pageData || !pageData.title || !pageData.contentText) {
        logger.warn({ url: crawledPage.url }, 'Failed to parse page data');
        return;
      }

      // Check if source already exists
      const existingSource = await db.source.findUnique({
        where: { sourceUrl: crawledPage.url },
        include: { pages: true },
      });

      let source;
      let hasChanges = false;

      if (existingSource) {
        // Check for content changes
        hasChanges = existingSource.contentHash !== crawledPage.contentHash;

        // Update source
        source = await db.source.update({
          where: { id: existingSource.id },
          data: {
            lastScrapedAt: crawledPage.scrapedAt,
            statusCode: crawledPage.statusCode,
            etag: crawledPage.headers.etag,
            contentHash: crawledPage.contentHash,
            rawHtml: Buffer.from(crawledPage.html),
          },
        });

        logger.info({
          url: crawledPage.url,
          hasChanges,
        }, 'Updated existing source');
      } else {
        // Create new source
        source = await db.source.create({
          data: {
            sourceUrl: crawledPage.url,
            urlHash: crawledPage.urlHash,
            firstSeenAt: crawledPage.scrapedAt,
            lastScrapedAt: crawledPage.scrapedAt,
            statusCode: crawledPage.statusCode,
            etag: crawledPage.headers.etag,
            contentHash: crawledPage.contentHash,
            rawHtml: Buffer.from(crawledPage.html),
          },
        });

        logger.info({ url: crawledPage.url }, 'Created new source');
      }

      // Create or update page
      await this.upsertPage(source.id, pageData, hasChanges);

    } catch (error: any) {
      logger.error({
        url: crawledPage.url,
        error: error.message,
      }, 'Error loading page');
      throw error;
    }
  }

  /**
   * Upsert page and related data
   */
  private async upsertPage(
    sourceId: number,
    pageData: Partial<PageData>,
    hasChanges: boolean
  ): Promise<void> {
    // Find existing page
    const existingPage = await db.page.findFirst({
      where: { sourceId },
      include: {
        visaTypes: {
          include: {
            eligibility: true,
            documents: true,
            fees: true,
            processingTimes: true,
            steps: true,
            externalLinks: true,
          },
        },
      },
    });

    if (existingPage && hasChanges) {
      // Record the change
      const oldContent = existingPage.contentText;
      const newContent = pageData.contentText || '';
      const diffSummary = this.generateDiffSummary(oldContent, newContent);

      await db.change.create({
        data: {
          pageId: existingPage.id,
          scrapedAt: new Date(),
          diffSummary,
        },
      });

      logger.info({ pageId: existingPage.id }, 'Recorded page changes');

      // Delete old visa types and related data (cascade)
      await db.visaType.deleteMany({
        where: { pageId: existingPage.id },
      });
    }

    // Upsert page
    const page = await db.page.upsert({
      where: { id: existingPage?.id || 0 },
      create: {
        sourceId,
        title: pageData.title!,
        slug: pageData.slug!,
        summary: pageData.summary,
        lastUpdatedOn: pageData.lastUpdatedOn,
        contentText: pageData.contentText!,
        contentMarkup: pageData.contentMarkup,
      },
      update: {
        title: pageData.title!,
        slug: pageData.slug!,
        summary: pageData.summary,
        lastUpdatedOn: pageData.lastUpdatedOn,
        contentText: pageData.contentText!,
        contentMarkup: pageData.contentMarkup,
      },
    });

    // Create visa types and related data
    if (pageData.visaTypes) {
      for (const visaTypeData of pageData.visaTypes) {
        const visaType = await db.visaType.create({
          data: {
            pageId: page.id,
            name: visaTypeData.name,
            category: visaTypeData.category,
            purpose: visaTypeData.purpose,
            audience: visaTypeData.audience,
            isActive: visaTypeData.isActive ?? true,
          },
        });

        // Create related records
        if (visaTypeData.eligibility) {
          await db.eligibilityCriterion.createMany({
            data: visaTypeData.eligibility.map(e => ({
              visaTypeId: visaType.id,
              criterion: e.criterion,
            })),
          });
        }

        if (visaTypeData.documents) {
          await db.requiredDocument.createMany({
            data: visaTypeData.documents.map(d => ({
              visaTypeId: visaType.id,
              docName: d.docName,
              notes: d.notes,
            })),
          });
        }

        if (visaTypeData.fees) {
          await db.fee.createMany({
            data: visaTypeData.fees.map(f => ({
              visaTypeId: visaType.id,
              feeName: f.feeName,
              amount: f.amount,
              currency: f.currency,
              notes: f.notes,
            })),
          });
        }

        if (visaTypeData.processingTimes) {
          await db.processingTime.createMany({
            data: visaTypeData.processingTimes.map(pt => ({
              visaTypeId: visaType.id,
              timelineLabel: pt.timelineLabel,
              minDays: pt.minDays,
              maxDays: pt.maxDays,
              notes: pt.notes,
            })),
          });
        }

        if (visaTypeData.steps) {
          await db.step.createMany({
            data: visaTypeData.steps.map(s => ({
              visaTypeId: visaType.id,
              stepOrder: s.stepOrder,
              stepTitle: s.stepTitle,
              stepDetail: s.stepDetail,
            })),
          });
        }

        if (visaTypeData.externalLinks) {
          await db.externalLink.createMany({
            data: visaTypeData.externalLinks.map(el => ({
              visaTypeId: visaType.id,
              linkTitle: el.linkTitle,
              linkUrl: el.linkUrl,
            })),
          });
        }
      }
    }

    logger.info({
      pageId: page.id,
      visaTypeCount: pageData.visaTypes?.length || 0,
    }, 'Page loaded successfully');
  }

  /**
   * Generate diff summary between old and new content
   */
  private generateDiffSummary(oldContent: string, newContent: string): string {
    const diff = diffLines(oldContent, newContent);
    
    const changes: string[] = [];
    let addedLines = 0;
    let removedLines = 0;

    for (const part of diff) {
      if (part.added) {
        addedLines += part.count || 0;
        const preview = part.value.substring(0, 200);
        changes.push(`+ ${preview}${part.value.length > 200 ? '...' : ''}`);
      } else if (part.removed) {
        removedLines += part.count || 0;
        const preview = part.value.substring(0, 200);
        changes.push(`- ${preview}${part.value.length > 200 ? '...' : ''}`);
      }
    }

    const summary = {
      addedLines,
      removedLines,
      changes: changes.slice(0, 10), // Keep first 10 changes
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(summary, null, 2);
  }

  /**
   * Get statistics about loaded data
   */
  async getStats(): Promise<{
    totalSources: number;
    totalPages: number;
    totalVisaTypes: number;
    lastScraped: Date | null;
  }> {
    const [
      totalSources,
      totalPages,
      totalVisaTypes,
      lastSource,
    ] = await Promise.all([
      db.source.count(),
      db.page.count(),
      db.visaType.count(),
      db.source.findFirst({
        orderBy: { lastScrapedAt: 'desc' },
        select: { lastScrapedAt: true },
      }),
    ]);

    return {
      totalSources,
      totalPages,
      totalVisaTypes,
      lastScraped: lastSource?.lastScrapedAt || null,
    };
  }
}
