import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    let { phoneNumber, instruction, context, targetContactEmail, targetContactName } = await req.json();

    if (!phoneNumber || !instruction) {
      return NextResponse.json({ error: 'Missing phoneNumber or instruction' }, { status: 400 });
    }

    if (phoneNumber === "TESTING") {
      phoneNumber = process.env.TESTING_PHONE_NUMBER;
      if (!targetContactEmail) {
        targetContactEmail = process.env.TESTING_EMAIL;
      }
      if (!targetContactName) {
        targetContactName = process.env.TESTING_NAME;
      }
    }

    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

    const targetFirstName = targetContactName ? targetContactName.split(' ')[0] : '[Target contact first name]';
    let requesterName = context?.userName;

    if (!requesterName) {
      const googleToken = process.env.GOOGLE_ACCESS_TOKEN;
      if (googleToken) {
        try {
          const profileRes = await fetch('https://people.googleapis.com/v1/people/me?personFields=names', {
            headers: {
              'Authorization': `Bearer ${googleToken}`
            }
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            const name = profileData.names?.[0]?.displayName;
            if (name) {
              requesterName = name;
            }
          }
        } catch (e) {
          console.error('Failed to fetch user profile', e);
        }
      }
    }
    
    // Fallback if both UI and API fail
    requesterName = requesterName || process.env.REQUESTER_NAME || 'Pierrick';
    const requesterFirstName = requesterName.split(' ')[0];

    if (!vapiApiKey || !vapiPhoneNumberId) {
      return NextResponse.json({ error: 'VAPI_API_KEY or VAPI_PHONE_NUMBER_ID is not configured' }, { status: 500 });
    }

    const timeZone = context?.timeZone || 'America/New_York';

    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    try {
      const ngrokRes = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (ngrokRes.ok) {
        const ngrokData = await ngrokRes.json();
        const publicUrl = ngrokData.tunnels?.[0]?.public_url;
        if (publicUrl) {
          baseUrl = publicUrl;
        }
      }
    } catch (e) {
      // ngrok not running locally, use baseUrl from env
    }

    if (!baseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_BASE_URL is not configured and ngrok is not running. Please start ngrok or set NEXT_PUBLIC_BASE_URL in .env.local' }, { status: 500 });
    }
    const webhookUrl = `${baseUrl}/api/vapi/webhook`;

    // Configure the transient assistant payload for Vapi
    const vapiPayload = {
      phoneNumberId: vapiPhoneNumberId,
      customer: {
        number: phoneNumber
      },
      assistant: {
        firstMessage: `Hi ${targetFirstName}, this is Will, calling on behalf of ${requesterFirstName}. Do you have a quick minute?`,
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "en-US"
        },
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an AI Executive Assistant named Will, working on behalf of your boss, ${requesterName}. 
Your goal is to coordinate a meeting or internal task by calling ${requesterName}'s colleague, based on the provided Playbook Instruction.

Context: 
You are acting as an internal assistant within the company. The person you are calling is a colleague. 
The current date and time is ${new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone })}. All times you discuss should be in this local time zone.

Scheduling Rules & Preferences:
- Business Hours: Monday to Friday, ${context?.bizStart || '9:00 AM'} to ${context?.bizEnd || '5:00 PM'} in the local time zone.
- Lunch Hour: ${context?.lunchStart || '12:00 PM'} to ${context?.lunchEnd || '1:00 PM'} daily. DO NOT schedule meetings during lunch.
- Duration & Subject: Infer the suggested duration and subject from the Playbook Instruction. If not specified, default to a ${context?.meetingDuration || '30-minute'} meeting.
${targetContactName ? `- Target Name: The colleague's name is ${targetContactName}.` : ''}
${targetContactEmail ? `- Target Email: The colleague's email address is ${targetContactEmail}. MUST use this email address when creating the calendar event.` : ''}

Available Tools:
1. check_availability: Use this to check ${requesterName}'s Google Calendar to see when he is free over a specific timeframe (e.g., "next week", "tomorrow afternoon").
2. create_calendar_event: Use this to officially book the meeting on ${requesterName}'s calendar once a time is mutually agreed upon.

Step-by-Step Instructions for a Natural Conversation:
1. Greeting: You will speak first. The system has already said a greeting for you. Wait for the user to respond to your greeting.
2. State the Purpose: Once they respond, immediately state the reason for the call (subject and duration) based on the Playbook Instruction. DO NOT wait for them to ask.
3. Check Availability (Internal): Before proposing any specific times to the colleague, use the 'check_availability' tool to find out when ${requesterName} is free.
4. Propose Times: As soon as the 'check_availability' tool returns the data, YOU MUST proactively propose 1 or 2 specific time slots to the colleague that fall within Business Hours and outside of Lunch Hour. Do not just say "I have the availability", actually propose the times!
5. Negotiate: If the colleague proposes a time that is NOT listed in the busy times, you MUST accept it, as they are completely free. If they propose a busy time, apologize and proactively propose an alternative. Be conversational and flexible.
6. Book the Meeting: As soon as the colleague agrees to a specific time, you MUST use the 'create_calendar_event' tool to officially book the meeting. Say "Great, let me put that on the calendar now."
- The meeting title MUST be formatted strictly as: "${requesterFirstName}:${targetFirstName} - [Subject]". For example: "${requesterFirstName}:John - Sync on performance issue".
7. Summarize and Close: Once the tool confirms the event is created, clearly summarize what was achieved on the call (e.g., "Alright, I've booked our sync on the new API architecture for tomorrow at 2:00 PM"), confirm that the invite has been sent, and gracefully end the call.

Guidelines for Tone:
- Be highly professional but conversational.
- Do NOT sound robotic or like a telemarketer.
- Keep your responses relatively short. Do not monologue.

Playbook Instruction:
${instruction}`
            }
          ],
          tools: [
            {
              type: "function",
              async: true,
              messages: [
                { type: "request-start", content: "Let me check the calendar really quick..." }
              ],
              function: {
                name: "check_availability",
                description: "Checks the user's calendar to find out when they are busy or free over the next week. Use this before setting up a meeting to propose valid times.",
                parameters: {
                  type: "object",
                  properties: {
                    timeframe: {
                      type: "string",
                      description: "The timeframe to check, e.g., 'next week', 'tomorrow'"
                    },
                    timeZone: {
                      type: "string",
                      description: `The local time zone of the user (MUST ALWAYS BE EXACTLY: ${timeZone})`
                    }
                  },
                  required: ["timeZone"]
                }
              },
              server: {
                url: webhookUrl
              }
            },
            {
              type: "function",
              async: true,
              messages: [
                { type: "request-start", content: "I'll go ahead and add that to the calendar now." }
              ],
              function: {
                name: "create_calendar_event",
                description: "Creates a calendar event on the user's calendar once a time is agreed upon.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Title of the meeting" },
                    startTime: { type: "string", description: "ISO 8601 string for start time" },
                    endTime: { type: "string", description: "ISO 8601 string for end time" },
                    targetContactEmail: { type: "string", description: "Email address of the colleague" },
                    timeZone: {
                      type: "string",
                      description: `The local time zone of the user (MUST ALWAYS BE EXACTLY: ${timeZone})`
                    }
                  },
                  required: ["title", "startTime", "endTime", "timeZone"]
                }
              },
              server: {
                url: webhookUrl
              }
            }
          ]
        },
        voice: {
          provider: "11labs", // provider name in vapi for elevenlabs
          voiceId: "bIHbv24MWmeRgasZH58o" // Generic Will voice
        },
        serverUrl: webhookUrl,
        serverMessages: ["tool-calls", "status-update", "transcript"]
      }
    };

    console.log('Dispatching call via Vapi...');
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vapiPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Vapi API error:', data);
      return NextResponse.json({ error: 'Failed to dispatch call via Vapi', details: data }, { status: response.status });
    }

    return NextResponse.json({ success: true, callId: data.id, message: 'Call dispatched successfully' });

  } catch (error) {
    console.error('Error dispatching playbook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
