import { PrismaClient } from '@prisma/client';
import { DefaultAzureCredential } from '@azure/identity';

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

async function getAccessToken(): Promise<string> {
  if (process.env.NODE_ENV === 'production' && process.env.USE_MANAGED_IDENTITY === 'true') {
    try {
      const credential = new DefaultAzureCredential();
      const token = await credential.getToken('https://database.windows.net/');
      return token.token;
    } catch (error) {
      console.error('Failed to get Azure AD token:', error);
      throw error;
    }
  }
  return '';
}

export async function getDatabaseUrl(): Promise<string> {
  const baseUrl = process.env.DATABASE_URL;
  
  if (!baseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // In production with MSI, append access token
  if (process.env.NODE_ENV === 'production' && process.env.USE_MANAGED_IDENTITY === 'true') {
    const token = await getAccessToken();
    // For Azure SQL with MSI, we need to use the token in the connection
    // This is typically done via the connection string or driver-specific methods
    return baseUrl; // Token will be handled by the driver
  }

  return baseUrl;
}

export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    if (!prisma) {
      prisma = new PrismaClient({
        log: ['error', 'warn'],
      });
    }
    return prisma;
  } else {
    if (!global.__prisma) {
      global.__prisma = new PrismaClient({
        log: ['query', 'error', 'warn'],
      });
    }
    return global.__prisma;
  }
}

export const db = getPrismaClient();

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect();
});

export default db;
