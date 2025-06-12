import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { username, gpu, score, fps } = await request.json();
  
    // 1. Validate incoming data
    if (!username || !gpu || score === undefined || score === null) {
      return NextResponse.json(
        { error: 'Missing required fields (username, gpu, score).' },
        { status: 400 }
      );
    }

    // 2. Prepare data for Supabase
    const submissionData = {
      username,
      gpu,
      score: Number(score),
      fps: fps ? Number(fps) : null,
    };
    
    console.log('Attempting to insert into Supabase:', submissionData);

    // 3. Insert data into Supabase
    const { data, error } = await supabase
      .from('BenchmarkRun')
      .insert([submissionData])
      .select()
      .single();

    // 4. Handle Supabase errors
    if (error) {
      console.error('Supabase error:', error.message);
      // Provide a more specific error message if possible
      return NextResponse.json(
        { error: `Supabase error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('Successfully submitted to Supabase:', data);
    
    // 5. Return the newly created record
    return NextResponse.json(data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in submit-benchmark endpoint:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to process benchmark submission.', details: errorMessage },
      { status: 500 }
    );
  }
}