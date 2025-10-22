'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search visa types, requirements, processing times..."
          className="flex-1 px-6 py-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-sm text-gray-600">Quick filters:</span>
        {[
          { label: 'Work', value: 'work' },
          { label: 'Family', value: 'family' },
          { label: 'Business', value: 'business' },
          { label: 'Tourist', value: 'tourist' },
        ].map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => router.push(`/search?category=${filter.value}`)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            {filter.label}
          </button>
        ))}
      </div>
    </form>
  );
}
