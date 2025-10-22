import { NextResponse } from 'next/server';
import { db } from '@qatar-visa/database';

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;

    // Get basic stats
    const [sourceCount, visaTypeCount] = await Promise.all([
      db.source.count(),
      db.visaType.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        sources: sourceCount,
        visaTypes: visaTypeCount,
      },
      version: process.env.APP_VERSION || '1.0.0',
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      { status: 503 }
    );
  }
}
