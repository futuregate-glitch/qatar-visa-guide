// Simple script to load visas.jsonl into your database
// Run with: node load-visa-data.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function loadVisaData() {
  try {
    console.log('📖 Reading visas.jsonl file...');
    
    // Read the JSONL file - adjust path as needed
    const filePath = path.join(__dirname, 'visas.jsonl');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    console.log(`Found ${lines.length} visa entries`);
    
    let loaded = 0;
    let skipped = 0;

    for (const line of lines) {
      try {
        const visaData = JSON.parse(line);
        
        // Check if source already exists
        const existingSource = await prisma.source.findUnique({
          where: { url: visaData.source_url }
        });
        
        if (existingSource) {
          console.log(`⏭️  Skipping existing: ${visaData.title}`);
          skipped++;
          continue;
        }
        
        console.log(`📝 Processing: ${visaData.title}`);
        
        // Create source entry
        const source = await prisma.source.create({
          data: {
            url: visaData.source_url,
            domain: new URL(visaData.source_url).hostname,
            content_html: visaData.content_summary || '',
            content_hash: Buffer.from(visaData.source_url).toString('base64').substring(0, 50),
            status: 'completed',
            last_fetched_at: new Date(),
          }
        });
        
        // Create page entry
        const page = await prisma.page.create({
          data: {
            source_id: source.id,
            title: visaData.title,
            content_text: visaData.content_summary || '',
            content_markup: JSON.stringify(visaData.sections || {}),
            summary: (visaData.content_summary || '').substring(0, 500),
          }
        });
        
        // Create visa type if it has a category
        if (visaData.visa_type_guess && visaData.visa_type_guess !== 'general') {
          const visaType = await prisma.visaType.create({
            data: {
              page_id: page.id,
              name: visaData.title,
              category: visaData.visa_type_guess,
              purpose: extractPurpose(visaData.sections),
              summary: (visaData.content_summary || '').substring(0, 500),
            }
          });
          
          // Extract and create structured data
          if (visaData.sections) {
            await extractAndCreateDetails(visaType.id, visaData.sections);
          }
        }
        
        // Create external links
        if (visaData.official_links && visaData.official_links.length > 0) {
          // Remove duplicates
          const uniqueLinks = Array.from(
            new Map(visaData.official_links.map(link => [link.url, link])).values()
          );
          
          for (const link of uniqueLinks) {
            try {
              await prisma.externalLink.create({
                data: {
                  page_id: page.id,
                  title: link.title,
                  url: link.url,
                  link_type: 'official',
                }
              });
            } catch (err) {
              // Skip duplicate links
            }
          }
        }
        
        console.log(`✅ Loaded: ${visaData.title}`);
        loaded++;
        
      } catch (err) {
        console.error(`❌ Error processing entry: ${err.message}`);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`  ✅ Loaded: ${loaded}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  📄 Total: ${lines.length}`);
    
  } catch (error) {
    console.error('Error loading visa data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function extractAndCreateDetails(visaTypeId, sections) {
  // Extract fees
  if (sections.fees) {
    try {
      await prisma.fee.create({
        data: {
          visa_type_id: visaTypeId,
          description: sections.fees,
          amount: extractAmount(sections.fees),
          currency: 'QAR',
        }
      });
    } catch (err) {}
  }
  
  // Extract processing time
  if (sections.processing_time) {
    try {
      const days = extractDays(sections.processing_time);
      await prisma.processingTime.create({
        data: {
          visa_type_id: visaTypeId,
          description: sections.processing_time,
          min_days: days.min,
          max_days: days.max,
        }
      });
    } catch (err) {}
  }
  
  // Extract steps
  if (sections.steps) {
    const stepsList = sections.steps.split('\n').filter(s => s.trim());
    for (let i = 0; i < Math.min(stepsList.length, 10); i++) {
      try {
        await prisma.step.create({
          data: {
            visa_type_id: visaTypeId,
            step_number: i + 1,
            description: stepsList[i].trim().substring(0, 1000),
          }
        });
      } catch (err) {}
    }
  }
  
  // Extract validity
  if (sections.validity) {
    try {
      await prisma.eligibilityCriteria.create({
        data: {
          visa_type_id: visaTypeId,
          description: `Validity: ${sections.validity}`,
        }
      });
    } catch (err) {}
  }
}

function extractPurpose(sections) {
  if (!sections) return 'General visa information';
  
  // Try to extract purpose from various sections
  for (const key of ['purpose', 'description', 'summary']) {
    if (sections[key]) {
      return sections[key].substring(0, 200);
    }
  }
  
  return 'General visa information';
}

function extractAmount(text) {
  const match = text.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:QAR|QR|riyal)/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function extractDays(text) {
  const match = text.match(/(\d+)(?:-(\d+))?\s*(?:days?|working days?)/i);
  if (match) {
    return {
      min: parseInt(match[1]),
      max: match[2] ? parseInt(match[2]) : null,
    };
  }
  return { min: null, max: null };
}

// Run the loader
loadVisaData()
  .then(() => {
    console.log('\n✅ Data loading completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Data loading failed:', error);
    process.exit(1);
  });
