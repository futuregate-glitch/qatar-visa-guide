# Qatar Visa Guide - Production-Grade Immigration Information Platform

A comprehensive web application for ingesting, searching, and viewing Qatar visa and immigration information from [visaguideqatar.com](https://www.visaguideqatar.com/). Built with Next.js, Azure App Service, Azure SQL Database, and TypeScript.

## 🎯 Features

- **Intelligent ETL Pipeline**: Polite web crawler with robots.txt support, rate limiting, and content classification
- **Advanced Search**: Full-text search with faceted filtering (visa type, purpose, fees, processing time)
- **Change Tracking**: Automatic detection and display of content changes
- **Azure Managed Identity**: Secure database access without connection strings
- **Production-Ready**: Complete IaC (Bicep), CI/CD (GitHub Actions), monitoring (Application Insights)
- **Mobile-Friendly**: Responsive design with Tailwind CSS
- **Comprehensive Data Model**: Normalized schema with 10+ tables for structured visa information

## 📋 Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Azure Deployment](#azure-deployment)
- [ETL Pipeline](#etl-pipeline)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## 🏗️ Architecture

```
┌─────────────────┐
│  GitHub Actions │
│    CI/CD        │
└────────┬────────┘
         │ Deploy
         ▼
┌─────────────────────────────────────┐
│      Azure App Service              │
│  ┌───────────────────────────────┐  │
│  │   Next.js Web App             │  │
│  │   - Search UI                 │  │
│  │   - Detail Pages              │  │
│  │   - API Routes                │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   ETL Pipeline                │  │
│  │   - Crawler (Playwright)      │  │
│  │   - Parser (Cheerio)          │  │
│  │   - Loader (Prisma)           │  │
│  └───────────────────────────────┘  │
└───────────┬─────────────────────────┘
            │ Managed Identity
            ▼
┌─────────────────────┐
│   Azure SQL DB      │
│   - Sources         │
│   - Pages           │
│   - Visa Types      │
│   - Eligibility     │
│   - Documents       │
│   - Fees            │
│   - Steps           │
│   - Changes         │
└─────────────────────┘
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18 LTS
- **Framework**: Next.js 14 (App Router)
- **Database**: Azure SQL Database with Prisma ORM
- **Crawler**: Playwright + Cheerio
- **Authentication**: Azure Managed Identity

### Frontend
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query
- **SEO**: Next.js SSR/SSG

### Infrastructure
- **Hosting**: Azure App Service (Linux)
- **Database**: Azure SQL Database
- **Storage**: Azure Blob Storage
- **Monitoring**: Application Insights
- **Secrets**: Azure Key Vault
- **IaC**: Bicep
- **CI/CD**: GitHub Actions

## 📁 Project Structure

```
qatar-visa-guide/
├── .github/
│   └── workflows/
│       └── ci-cd.yml              # GitHub Actions pipeline
├── infra/
│   ├── main.bicep                 # Main infrastructure template
│   └── parameters.json            # Environment parameters
├── packages/
│   ├── database/                  # Database layer
│   │   ├── prisma/
│   │   │   └── schema.prisma      # Database schema
│   │   └── src/
│   │       └── index.ts           # Prisma client with MSI
│   ├── etl/                       # ETL pipeline
│   │   └── src/
│   │       ├── crawler.ts         # Polite web crawler
│   │       ├── parser.ts          # Content parser
│   │       ├── loader.ts          # Database loader
│   │       ├── classifier.ts      # Content classifier
│   │       └── crawl.ts           # Main ETL orchestrator
│   ├── shared/                    # Shared utilities
│   │   └── src/
│   │       └── index.ts           # Types, constants, validators
│   └── web/                       # Next.js web app
│       └── src/
│           ├── app/               # App router pages
│           │   ├── page.tsx       # Homepage
│           │   ├── layout.tsx     # Root layout
│           │   └── api/           # API routes
│           │       ├── search/
│           │       ├── visa-types/
│           │       └── health/
│           └── components/        # React components
├── package.json                   # Root workspace config
└── README.md                      # This file
```

## ✅ Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Azure CLI** 2.50+ (for deployment)
- **Azure Subscription** with Owner/Contributor access
- **Git** for version control

### Optional for Local Development
- **Docker Desktop** (for local SQL Server)
- **Visual Studio Code** with extensions:
  - Prisma
  - Azure App Service
  - Azure Account

## 🚀 Local Development

### 1. Clone and Install

```bash
git clone <repository-url>
cd qatar-visa-guide
npm install
```

### 2. Setup Local Database

#### Option A: Docker (Recommended)

```bash
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourStrong@Passw0rd" \
  -p 1433:1433 --name sql-server \
  -d mcr.microsoft.com/mssql/server:2022-latest
```

#### Option B: Azure SQL Database

Create a database in Azure and note the connection string.

### 3. Configure Environment

Create `.env` file in root:

```env
# Database
DATABASE_URL="sqlserver://localhost:1433;database=qatar_visa_guide;user=sa;password=YourStrong@Passw0rd;encrypt=true;trustServerCertificate=true"

# Azure (for production)
USE_MANAGED_IDENTITY=false

# Application
NODE_ENV=development
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run db:generate --workspace=database

# Run migrations
npm run db:migrate:dev --workspace=database
```

### 5. Run ETL Pipeline

```bash
# Full crawl and load
npm run etl:crawl

# Check stats
npm run etl:crawl -- stats
```

### 6. Start Web Server

```bash
# Development mode with hot reload
npm run dev

# Open http://localhost:3000
```

### 7. Build for Production

```bash
npm run build
npm run start
```

## ☁️ Azure Deployment

### 1. Prerequisites

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription "<subscription-id>"

# Create resource group
az group create --name qatar-visa-guide-rg --location eastus
```

### 2. Deploy Infrastructure

```bash
cd infra

# Deploy using Bicep
az deployment group create \
  --resource-group qatar-visa-guide-rg \
  --template-file main.bicep \
  --parameters \
    environment=prod \
    appName=qatar-visa-guide \
    sqlAdminLogin=sqladmin \
    sqlAdminPassword='<strong-password>'
```

### 3. Configure Managed Identity for SQL

After deployment, configure the app service managed identity to access SQL:

```sql
-- Connect to Azure SQL Database as SQL Admin
-- Create contained user for managed identity
CREATE USER [qatar-visa-guide-prod-app] FROM EXTERNAL PROVIDER;

-- Grant permissions
ALTER ROLE db_datareader ADD MEMBER [qatar-visa-guide-prod-app];
ALTER ROLE db_datawriter ADD MEMBER [qatar-visa-guide-prod-app];
ALTER ROLE db_ddladmin ADD MEMBER [qatar-visa-guide-prod-app];
```

### 4. Setup GitHub Secrets

Configure the following secrets in GitHub repository settings:

- `AZURE_CREDENTIALS`: Service principal JSON
- `AZURE_APP_SERVICE_NAME`: App service name
- `SQL_ADMIN_LOGIN`: SQL administrator username
- `SQL_ADMIN_PASSWORD`: SQL administrator password
- `DATABASE_URL`: Connection string
- `APP_URL`: Application URL

### 5. Deploy via CI/CD

```bash
# Push to main branch to trigger deployment
git push origin main

# Or manually trigger workflow
gh workflow run ci-cd.yml
```

### 6. Configure Scheduled ETL

Create an Azure Function with Timer Trigger or use Azure WebJobs:

```json
{
  "schedule": "0 0 2 * * *",
  "description": "Run ETL daily at 2 AM UTC"
}
```

## 🔄 ETL Pipeline

### How It Works

1. **Discovery**: Starts with seed URLs, follows internal links
2. **Classification**: Filters URLs and content for immigration/visa topics only
3. **Crawling**: Polite crawler respects robots.txt, rate limits (0.5-1.5s delay)
4. **Parsing**: Extracts structured data (eligibility, docs, fees, steps)
5. **Loading**: Upserts into Azure SQL with change detection
6. **Tracking**: Records diffs for "What changed?" feature

### Running Manually

```bash
# Full ETL run
npm run etl:crawl -- run

# View statistics
npm run etl:crawl -- stats
```

### Adjusting the Classifier

Edit `packages/etl/src/classifier.ts` to modify:

- `VISA_URL_PATTERNS`: URL patterns to include
- `EXCLUDE_URL_PATTERNS`: URL patterns to exclude
- `VISA_KEYWORDS`: Content keywords that indicate relevance
- Classification scoring logic

### Seed URLs

Modify `packages/etl/src/crawl.ts` `SEED_URLS` array:

```typescript
const SEED_URLS = [
  'https://www.visaguideqatar.com/',
  'https://www.visaguideqatar.com/work-visa/',
  // Add more seed URLs
];
```

## 📡 API Documentation

### Search Visas

**Endpoint**: `GET /api/search`

**Query Parameters**:
- `q` (string): Keyword search
- `category` (string): work | family | business | tourist | student
- `purpose` (string): Visa purpose
- `feeMin` (number): Minimum fee
- `feeMax` (number): Maximum fee
- `processingDaysMax` (number): Maximum processing time
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 20)
- `sortBy` (string): relevance | updated | processing_time | fees

**Example**:
```bash
curl "https://your-app.azurewebsites.net/api/search?q=work&feeMax=1000"
```

### Get Visa Details

**Endpoint**: `GET /api/visa-types/{id}`

**Response**: Full visa details including eligibility, documents, fees, steps, changes

**Example**:
```bash
curl "https://your-app.azurewebsites.net/api/visa-types/123"
```

### Health Check

**Endpoint**: `GET /api/health`

**Response**: Application and database health status

## 🗄️ Database Schema

### Key Tables

- **sources**: Raw web pages (URL, HTML, hash, etag)
- **pages**: Parsed content (title, summary, text, markup)
- **visa_types**: Visa definitions (name, category, purpose)
- **eligibility_criteria**: Eligibility requirements
- **required_documents**: Document requirements
- **fees**: Fee information with amounts
- **processing_times**: Timeline information
- **steps**: Application process steps
- **external_links**: Official government links
- **changes**: Change history with diffs

### Indexes

- Full-text index on `pages.content_text`
- Composite indexes for filtering visa types
- Foreign key indexes for joins

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQL Server connection string | Yes |
| `USE_MANAGED_IDENTITY` | Enable Azure Managed Identity | Production |
| `NODE_ENV` | Environment (development/production) | Yes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights | Production |

### Crawler Configuration

Edit `packages/etl/src/crawler.ts`:

```typescript
const config = {
  maxDepth: 3,           // Link following depth
  maxPages: 200,         // Maximum pages to crawl
  delayMin: 500,         // Minimum delay (ms)
  delayMax: 1500,        // Maximum delay (ms)
  respectRobotsTxt: true,// Honor robots.txt
  maxRetries: 3,         // Retry attempts
  timeout: 30000,        // Request timeout (ms)
};
```

## 📊 Monitoring

### Application Insights

View telemetry in Azure Portal:
- Request rates and latencies
- Failed requests and exceptions
- Dependency calls (SQL queries)
- Custom events (ETL runs)

### Logs

```bash
# View app service logs
az webapp log tail --name qatar-visa-guide-prod-app --resource-group qatar-visa-guide-rg

# Download logs
az webapp log download --name qatar-visa-guide-prod-app --resource-group qatar-visa-guide-rg
```

### Performance Targets

- P95 API latency < 300ms
- Search response time < 500ms
- 100+ concurrent users
- 99.9% uptime SLA

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test connection
sqlcmd -S your-server.database.windows.net -d qatar_visa_guide -U sqladmin -P password

# Check firewall rules
az sql server firewall-rule list --server <server-name> --resource-group <rg-name>
```

### Managed Identity Not Working

1. Verify identity is enabled on App Service
2. Check SQL user was created: `SELECT * FROM sys.database_principals`
3. Verify RBAC permissions on Key Vault

### ETL Crawler Issues

- Check robots.txt: `curl https://www.visaguideqatar.com/robots.txt`
- Review classifier logs for filtered URLs
- Adjust rate limiting if getting 429 errors
- Check Application Insights for exceptions

### Build Failures

```bash
# Clean and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📄 License

This project is for educational and research purposes. Always verify visa information with official Qatar government sources.

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create a GitHub issue
- Check Application Insights for errors
- Review Azure App Service diagnostics

---

**Disclaimer**: This is an unofficial summary of visa information. Always verify requirements with official Qatar government sources before making any decisions or applications.
