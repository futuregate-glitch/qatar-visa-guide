# Qatar Visa Guide - Deployment Guide

## Quick Start Deployment (15 minutes)

### Step 1: Prepare Azure Environment (5 min)

```bash
# Login to Azure
az login

# Set your subscription
az account set --subscription "<your-subscription-id>"

# Create resource group
az group create \
  --name qatar-visa-guide-rg \
  --location eastus
```

### Step 2: Deploy Infrastructure (5 min)

```bash
cd infra

# Deploy all resources
az deployment group create \
  --resource-group qatar-visa-guide-rg \
  --template-file main.bicep \
  --parameters \
    environment=prod \
    appName=qatar-visa-guide \
    sqlAdminLogin=sqladmin \
    sqlAdminPassword='YourStrongP@ssw0rd!'

# Save the outputs
az deployment group show \
  --resource-group qatar-visa-guide-rg \
  --name <deployment-name> \
  --query properties.outputs
```

### Step 3: Configure Database Access (2 min)

Connect to Azure SQL and run:

```sql
-- Get the managed identity name from outputs (appServiceName)
CREATE USER [qatar-visa-guide-prod-app] FROM EXTERNAL PROVIDER;

-- Grant permissions
ALTER ROLE db_datareader ADD MEMBER [qatar-visa-guide-prod-app];
ALTER ROLE db_datawriter ADD MEMBER [qatar-visa-guide-prod-app];
ALTER ROLE db_ddladmin ADD MEMBER [qatar-visa-guide-prod-app];
GO
```

### Step 4: Deploy Application (3 min)

```bash
# Build the application
npm install
npm run build

# Deploy to App Service (using ZIP deploy)
cd packages/web
az webapp deployment source config-zip \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app \
  --src ./.next/standalone.zip
```

## Detailed Deployment Options

### Option A: GitHub Actions (Recommended)

1. **Fork/Clone the repository**

2. **Create Azure Service Principal**

```bash
az ad sp create-for-rbac \
  --name "qatar-visa-guide-sp" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/qatar-visa-guide-rg \
  --sdk-auth
```

3. **Configure GitHub Secrets**

Go to Settings → Secrets and add:

| Secret Name | Value |
|------------|-------|
| `AZURE_CREDENTIALS` | JSON output from service principal |
| `AZURE_APP_SERVICE_NAME` | `qatar-visa-guide-prod-app` |
| `SQL_ADMIN_LOGIN` | Your SQL admin username |
| `SQL_ADMIN_PASSWORD` | Your SQL admin password |
| `DATABASE_URL` | SQL connection string |
| `APP_URL` | `https://qatar-visa-guide-prod-app.azurewebsites.net` |

4. **Push to trigger deployment**

```bash
git push origin main
```

The CI/CD pipeline will:
- ✅ Lint and test code
- ✅ Build the application
- ✅ Deploy infrastructure
- ✅ Run database migrations
- ✅ Deploy the app
- ✅ Run smoke tests

### Option B: Azure DevOps

Create `azure-pipelines.yml`:

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

variables:
  - group: qatar-visa-guide-vars

stages:
  - stage: Build
    jobs:
      - job: BuildJob
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          - script: npm ci
          - script: npm run build
          - task: PublishBuildArtifacts@1

  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployWeb
        environment: production
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureWebApp@1
                  inputs:
                    azureSubscription: 'azure-connection'
                    appName: 'qatar-visa-guide-prod-app'
                    package: '$(Pipeline.Workspace)/**/*.zip'
```

### Option C: Manual Deployment

1. **Build locally**

```bash
npm install
npm run build
cd packages/web
```

2. **Create deployment package**

```bash
zip -r deploy.zip .next/ public/ package.json
```

3. **Deploy via Azure CLI**

```bash
az webapp deployment source config-zip \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app \
  --src deploy.zip
```

## Database Migration

### First-time Setup

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="sqlserver://server.database.windows.net:1433;database=qatar_visa_guide;..."

# Run migrations
cd packages/database
npx prisma migrate deploy

# Seed with initial data (optional)
npm run seed
```

### Ongoing Migrations

```bash
# Create new migration
npx prisma migrate dev --name add_new_feature

# Apply in production
npx prisma migrate deploy
```

## ETL Pipeline Setup

### Schedule with Azure Functions

1. **Create Function App**

```bash
az functionapp create \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-etl \
  --storage-account <storage-account-name> \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4
```

2. **Add Timer Trigger**

Create `function.json`:

```json
{
  "bindings": [
    {
      "name": "myTimer",
      "type": "timerTrigger",
      "direction": "in",
      "schedule": "0 0 2 * * *"
    }
  ]
}
```

3. **Deploy ETL code**

```bash
cd packages/etl
func azure functionapp publish qatar-visa-etl
```

### Schedule with WebJobs

1. **Package ETL as WebJob**

```bash
cd packages/etl
zip -r etl-job.zip .
```

2. **Upload via Azure Portal**

- Go to App Service → WebJobs
- Add New → Upload `etl-job.zip`
- Set Schedule: `0 0 2 * * *` (daily at 2 AM)

## Monitoring Setup

### Application Insights

Already configured via Bicep. View in Azure Portal:

```bash
# Open App Insights
az monitor app-insights component show \
  --resource-group qatar-visa-guide-rg \
  --app qatar-visa-guide-prod-ai
```

### Log Analytics Queries

```kql
// Failed requests
requests
| where success == false
| project timestamp, name, resultCode, duration
| order by timestamp desc

// ETL runs
traces
| where message contains "ETL"
| project timestamp, message, severityLevel
| order by timestamp desc

// Slow queries
dependencies
| where type == "SQL"
| where duration > 1000
| project timestamp, name, duration, success
| order by duration desc
```

### Alerts

Create alerts for:
- Failed requests > 5%
- Response time > 2 seconds
- Database connection failures
- ETL job failures

```bash
az monitor metrics alert create \
  --name high-response-time \
  --resource-group qatar-visa-guide-rg \
  --scopes /subscriptions/<sub>/resourceGroups/qatar-visa-guide-rg/providers/Microsoft.Web/sites/qatar-visa-guide-prod-app \
  --condition "avg requests/duration > 2000" \
  --description "Alert when response time exceeds 2 seconds"
```

## Scaling Configuration

### App Service

```bash
# Scale out (add instances)
az appservice plan update \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-asp \
  --number-of-workers 3

# Auto-scale rules
az monitor autoscale create \
  --resource-group qatar-visa-guide-rg \
  --resource qatar-visa-guide-prod-asp \
  --resource-type Microsoft.Web/serverFarms \
  --name autoscale-rules \
  --min-count 2 \
  --max-count 5 \
  --count 2
```

### Database

```bash
# Scale up database
az sql db update \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql \
  --name qatar-visa-guide-db \
  --service-objective S2
```

## Security Hardening

### 1. Network Security

```bash
# Restrict to Azure services only
az sql server firewall-rule delete \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql \
  --name AllowAllWindowsAzureIps

# Add specific IP ranges
az sql server firewall-rule create \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql \
  --name office-network \
  --start-ip-address x.x.x.x \
  --end-ip-address x.x.x.x
```

### 2. Enable Private Endpoints

```bash
az network vnet create \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-vnet \
  --address-prefix 10.0.0.0/16

# Create private endpoint for SQL
az network private-endpoint create \
  --resource-group qatar-visa-guide-rg \
  --name sql-private-endpoint \
  --vnet-name qatar-visa-vnet \
  --subnet default \
  --private-connection-resource-id <sql-server-resource-id> \
  --group-id sqlServer \
  --connection-name sql-connection
```

### 3. Enable HTTPS Only

```bash
az webapp update \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app \
  --https-only true
```

## Backup and Disaster Recovery

### Database Backups

```bash
# Automated backups are enabled by default
# Manual backup
az sql db export \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql \
  --name qatar-visa-guide-db \
  --admin-user sqladmin \
  --admin-password <password> \
  --storage-key <storage-key> \
  --storage-key-type StorageAccessKey \
  --storage-uri https://<storage>.blob.core.windows.net/backups/backup.bacpac
```

### Point-in-Time Restore

```bash
az sql db restore \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql \
  --name qatar-visa-guide-db-restored \
  --source-database qatar-visa-guide-db \
  --time "2024-01-01T00:00:00Z"
```

## Troubleshooting Deployment

### Common Issues

**1. Database connection fails**

```bash
# Check firewall rules
az sql server firewall-rule list \
  --resource-group qatar-visa-guide-rg \
  --server qatar-visa-guide-prod-sql

# Test connection
sqlcmd -S qatar-visa-guide-prod-sql.database.windows.net \
  -d qatar-visa-guide-db \
  -U sqladmin \
  -P <password>
```

**2. Managed Identity not working**

```bash
# Verify identity is enabled
az webapp identity show \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app

# Check SQL user exists
sqlcmd -Q "SELECT name FROM sys.database_principals WHERE type = 'E'"
```

**3. Deployment fails**

```bash
# Check logs
az webapp log tail \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app

# View deployment logs
az webapp deployment list-publishing-credentials \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app
```

## Post-Deployment Checklist

- [ ] Infrastructure deployed successfully
- [ ] Database accessible with Managed Identity
- [ ] Application running and responding to health checks
- [ ] ETL pipeline scheduled and running
- [ ] Application Insights receiving telemetry
- [ ] Alerts configured
- [ ] Backups configured
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate installed
- [ ] Documentation updated

## Rollback Plan

```bash
# List deployment slots
az webapp deployment slot list \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app

# Swap slots (if using staging slot)
az webapp deployment slot swap \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app \
  --slot staging

# Or redeploy previous version
az webapp deployment source config-zip \
  --resource-group qatar-visa-guide-rg \
  --name qatar-visa-guide-prod-app \
  --src previous-version.zip
```

## Support

For deployment issues:
1. Check Application Insights for errors
2. Review Azure App Service logs
3. Verify database connectivity
4. Check GitHub Actions workflow logs
5. Review Bicep deployment outputs

---

**Next Steps**: After successful deployment, run the ETL pipeline to populate the database with visa information.
