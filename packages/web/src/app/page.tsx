import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import { db } from '@qatar-visa/database';

export default async function HomePage() {
  // Get stats for homepage
  const [totalVisas, recentlyUpdated] = await Promise.all([
    db.visaType.count({ where: { isActive: true } }),
    db.page.findMany({
      where: {
        visaTypes: {
          some: { isActive: true },
        },
      },
      orderBy: { lastUpdatedOn: 'desc' },
      take: 5,
      include: {
        visaTypes: {
          where: { isActive: true },
          take: 1,
        },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Qatar Visa & Immigration Guide
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Comprehensive information about Qatar visas, work permits, and residence permits
          </p>
          <p className="text-sm text-gray-500">
            {totalVisas} visa types • Updated daily
          </p>
        </div>

        {/* Search Section */}
        <div className="max-w-4xl mx-auto mb-16">
          <SearchForm />
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {[
            { name: 'Work Visa', icon: '💼', href: '/search?category=work' },
            { name: 'Family Visa', icon: '👨‍👩‍👧', href: '/search?category=family' },
            { name: 'Business Visa', icon: '🏢', href: '/search?category=business' },
            { name: 'Tourist Visa', icon: '✈️', href: '/search?category=tourist' },
          ].map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="text-4xl mb-3">{item.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
            </Link>
          ))}
        </div>

        {/* Recently Updated */}
        {recentlyUpdated.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Recently Updated
            </h2>
            <div className="space-y-4">
              {recentlyUpdated.map((page) => {
                const visaType = page.visaTypes[0];
                if (!visaType) return null;

                return (
                  <Link
                    key={page.id}
                    href={`/visa/${visaType.id}`}
                    className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {page.title}
                        </h3>
                        {page.summary && (
                          <p className="text-gray-600 text-sm line-clamp-2">
                            {page.summary}
                          </p>
                        )}
                      </div>
                      {page.lastUpdatedOn && (
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                          {new Date(page.lastUpdatedOn).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="max-w-4xl mx-auto mt-16 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">⚠️ Important Disclaimer</h3>
          <p className="text-sm text-gray-700">
            This is an unofficial summary of visa information. Always verify requirements 
            with official Qatar government sources before making any decisions or applications.
          </p>
        </div>
      </div>
    </div>
  );
}
