import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Mock database to store calls in memory for testing
let callLogs: any[] = [];

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('Received Vapi webhook message type:', payload.message?.type);

    // Store in our mock memory DB
    if (payload.message) {
      callLogs.unshift({
        id: Date.now(),
        type: payload.message.type,
        data: payload.message,
        timestamp: new Date().toISOString()
      });
      // Keep only last 50 logs
      if (callLogs.length > 50) callLogs = callLogs.slice(0, 50);
    }

    // Intercept Tool Calls from Vapi
    if (payload.message?.type === 'tool-calls') {
      const toolWithToolCallList = payload.message.toolWithToolCallList || [];
      const results: any[] = [];

      for (const item of toolWithToolCallList) {
        const { toolCall } = item;
        const name = toolCall.function.name;

        let args;
        try {
          args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch (e) {
          args = {};
        }

        const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
        if (!accessToken) {
          results.push({
            toolCallId: toolCall.id,
            result: "Error: GOOGLE_ACCESS_TOKEN not set in environment."
          });
          continue;
        }

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth });

        if (name === 'check_availability') {
          console.log('Vapi checking availability...');
          const userTimeZone = args.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          
          const timeMin = new Date();
          const timeMax = new Date();
          timeMax.setDate(timeMax.getDate() + 7);

          // Fetch all user calendars to get a complete free/busy picture
          let calendarItems = [{ id: 'primary' }];
          try {
            const listResponse = await calendar.calendarList.list();
            if (listResponse.data.items) {
              calendarItems = listResponse.data.items.map(c => ({ id: c.id as string }));
            }
          } catch (e) {
            console.error('Error fetching calendar list, falling back to primary:', e);
          }

          const response = await calendar.freebusy.query({
            requestBody: {
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
              timeZone: userTimeZone,
              items: calendarItems,
            }
          });

          // Aggregate busy slots across all calendars
          let busySlots: any[] = [];
          if (response.data.calendars) {
            for (const calId in response.data.calendars) {
              const calBusy = response.data.calendars[calId].busy;
              if (calBusy && calBusy.length > 0) {
                busySlots = busySlots.concat(calBusy);
              }
            }
          }

          // Sort busy slots by start time
          busySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());


          if (busySlots.length === 0) {
            results.push({
              toolCallId: toolCall.id,
              result: "The user has no conflicts and is completely free for the next 7 days."
            });
          } else {
            const formatter = new Intl.DateTimeFormat('en-US', {
              weekday: 'long', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
              timeZone: userTimeZone
            });
            const busyStrings = busySlots.map(slot => {
              const start = new Date(slot.start as string);
              const end = new Date(slot.end as string);
              return `- ${formatter.format(start)} to ${formatter.format(end)}`;
            });
            results.push({
              toolCallId: toolCall.id,
              result: `The user is busy during the following times over the next 7 days:\n${busyStrings.join('\n')}\nThey are free at all other times.`
            });
          }
        }
        else if (name === 'create_calendar_event') {
          console.log('Vapi creating calendar event:', args);
          const { title, startTime, endTime, targetContactEmail } = args;
          const userTimeZone = args.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

          try {
            const eventResponse = await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: title,
                start: {
                  dateTime: new Date(startTime).toISOString(),
                  timeZone: userTimeZone
                },
                end: {
                  dateTime: new Date(endTime).toISOString(),
                  timeZone: userTimeZone
                },
                attendees: targetContactEmail ? [{ email: targetContactEmail }] : []
              }
            });
            results.push({
              toolCallId: toolCall.id,
              result: `Event created successfully. Calendar Link: ${eventResponse.data.htmlLink}`
            });
          } catch (e: any) {
            console.error('Error creating event:', e);
            results.push({
              toolCallId: toolCall.id,
              result: `Error creating event: ${e.message}`
            });
          }
        }
      }

      // Return the synchronous results back to Vapi
      return NextResponse.json({ results });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(callLogs);
}

export async function DELETE() {
  callLogs = [];
  return NextResponse.json({ success: true });
}
