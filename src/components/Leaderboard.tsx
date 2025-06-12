'use client';

import React, { useEffect, useState } from "react";

export type BenchmarkEntry = {
  id?: string;
  position?: number;
  username: string;
  gpu: string;
  score: number;
  fps?: number;
  created_at?: string;
  createdAt?: string;
  updatedAt?: string;
};

// fallback mock data
const fallbackData: BenchmarkEntry[] = [
  { position: 1, username: "RTXMaster", gpu: "NVIDIA RTX 4090", score: 5300, fps: 2800 },
  { position: 2, username: "GPUWizard", gpu: "AMD Radeon RX 7900 XTX", score: 5150, fps: 2600 },
  { position: 3, username: "FrameRacer", gpu: "NVIDIA RTX 4080", score: 5000, fps: 2400 },
  { position: 4, username: "TechGuru", gpu: "NVIDIA RTX 4070 Ti", score: 4850, fps: 2200 },
  { position: 5, username: "PixelPusher", gpu: "AMD Radeon RX 7800 XT", score: 4700, fps: 2000 },
];

export default function Leaderboard() {
  const [leaderboardData, setLeaderboardData] = useState<BenchmarkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setIsLoading(true);
        setError(null);
        
        const baseUrl = window.location.origin;
        const timestamp = new Date().getTime();
        const apiUrl = `${baseUrl}/api/leaderboard?t=${timestamp}`;
        
        console.log('Fetching leaderboard from:', apiUrl);
        
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch leaderboard: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Leaderboard data received:', data);
        
        if (data.data && Array.isArray(data.data)) {
          setLeaderboardData(data.data);
        } else {
          throw new Error('Invalid data format received from API');
        }
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLeaderboardData(fallbackData);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLeaderboardData();
  }, []);

  return (
    <div className="w-full mb-12 relative z-10">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-200">
        Top Performers Leaderboard
      </h2>
      
      {isLoading ? (
        <div className="text-center py-6 text-gray-400">Loading leaderboard data...</div>
      ) : error ? (
        <div className="text-center py-6 text-red-400">Error: {error}</div>
      ) : leaderboardData.length === 0 ? (
        <div className="text-center py-6 text-gray-400">No benchmark data available yet. Be the first to submit!</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="mask relative rounded-lg bg-gray-800/20 backdrop-blur-2xl after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-br after:from-white/10 after:via-white/5 after:to-white/10 after:p-px shadow-lg after:pointer-events-none">
            <table className="min-w-full overflow-hidden">
              <thead className="bg-gradient-to-r bg-gray-950 text-white">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium uppercase tracking-wider">
                    GPU
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium uppercase tracking-wider">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {leaderboardData.map((entry) => (
                  <tr
                    key={entry.position || entry.id || entry.username}
                    className="hover:bg-gray-700/50 transition duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {entry.position || '?'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-50">
                      {entry.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-50">
                      {entry.gpu}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-50">
                      {entry.score.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
