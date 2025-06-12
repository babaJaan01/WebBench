import { NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate'
};

export async function GET() {
  try {
    console.log('API route: Fetching leaderboard data from Supabase...');
    
    const { data: supabaseData, error } = await supabase
      .from('BenchmarkRun')
      .select('*')
      .order('score', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('supabase error:', error.message);
      throw new Error(`supabase fetch failed: ${error.message}`);
    }
    
    console.log(`Successfully fetched ${supabaseData?.length || 0} entries from Supabase.`);
    
    const formattedData = (supabaseData ||[]).map((entry, index) => ({
      ...entry,
      position: index + 1
    }));
    
    return NextResponse.json({ data: formattedData }, { headers: NO_CACHE_HEADERS });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'unknown error occurred';
    console.error('Error fetching leaderboard:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard.', details: errorMessage },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}