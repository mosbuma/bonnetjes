import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if OpenAI API key is configured for shared data
    // Compare OPENAI_API_KEY with OPENAI_API_KEY_SHARED_DATA
    const apiKey = process.env.OPENAI_API_KEY || '';
    const sharedDataKey = process.env.OPENAI_API_KEY_SHARED_DATA || '';
    
    // If the current API key matches the shared data key, it's shared data mode
    const isSharedData = apiKey === sharedDataKey && apiKey !== '';
    
    return NextResponse.json({
      isSharedData: isSharedData,
      privacyMode: isSharedData ? 'shared' : 'private'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

