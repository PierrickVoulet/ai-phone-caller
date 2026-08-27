import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "Missing GOOGLE_ACCESS_TOKEN in environment." }, { status: 500 });
    }

    const { timeframe } = await request.json();

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth });

    // Determine the time range (default to next 7 days for simplicity)
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7);

    // Call freebusy API
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      }
    });

    const busySlots = response.data.calendars?.primary?.busy || [];

    if (busySlots.length === 0) {
      return NextResponse.json({ availability: "The user has no conflicts and is completely free for the next 7 days." });
    }

    // Format busy slots into a natural language string for Gemini
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });

    const busyStrings = busySlots.map(slot => {
      const start = new Date(slot.start as string);
      const end = new Date(slot.end as string);
      return `- ${formatter.format(start)} to ${formatter.format(end)}`;
    });

    const availabilityStr = `The user is busy during the following times over the next 7 days:\n${busyStrings.join('\n')}\nThey are free at all other times.`;

    return NextResponse.json({ availability: availabilityStr });

  } catch (error: any) {
    console.error("Calendar Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
