import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qatar Visa Guide - Immigration & Visa Information',
  description: 'Comprehensive guide to Qatar visas, work permits, residence permits, and immigration requirements',
  keywords: 'Qatar visa, work visa Qatar, family visa Qatar, residence permit Qatar, immigration Qatar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <nav className="bg-white border-b border-gray-200">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <a href="/" className="text-2xl font-bold text-blue-600">
                Qatar Visa Guide
              </a>
              <div className="flex gap-6">
                <a href="/search" className="text-gray-700 hover:text-blue-600">
                  Search
                </a>
                <a href="/about" className="text-gray-700 hover:text-blue-600">
                  About
                </a>
              </div>
            </div>
          </div>
        </nav>
        
        <main>{children}</main>
        
        <footer className="bg-gray-900 text-white mt-20">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="font-bold text-lg mb-4">Qatar Visa Guide</h3>
                <p className="text-gray-400 text-sm">
                  Unofficial immigration and visa information for Qatar
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-4">Important Links</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="https://portal.moi.gov.qa" className="text-gray-400 hover:text-white" target="_blank" rel="noopener noreferrer">
                      Ministry of Interior
                    </a>
                  </li>
                  <li>
                    <a href="https://hukoomi.gov.qa" className="text-gray-400 hover:text-white" target="_blank" rel="noopener noreferrer">
                      Hukoomi Portal
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-4">Disclaimer</h3>
                <p className="text-gray-400 text-sm">
                  This site provides unofficial summaries. Always verify with official government sources.
                </p>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
              © {new Date().getFullYear()} Qatar Visa Guide. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
