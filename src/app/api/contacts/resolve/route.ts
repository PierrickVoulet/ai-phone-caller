import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { instruction } = await req.json();

    if (!instruction) {
      return NextResponse.json({ error: 'Missing instruction' }, { status: 400 });
    }

    let targetName = "";

    // 1. Extract name using Gemini
    const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (geminiApiKey) {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Extract the first name of the person I am being asked to call from this instruction: "${instruction}". Return ONLY the name, nothing else. If you cannot find a name, return "NONE".` }]
          }]
        })
      });
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        targetName = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }
    }

    if (!targetName || targetName.toUpperCase() === "NONE") {
       return NextResponse.json({ matches: [], extractedName: null });
    }

    // 2. Lookup in Google Contacts
    const googleToken = process.env.GOOGLE_ACCESS_TOKEN;
    if (!googleToken) {
       return NextResponse.json({ error: 'Missing GOOGLE_ACCESS_TOKEN' }, { status: 500 });
    }

    const peopleRes = await fetch(`https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers`, {
      headers: { 'Authorization': `Bearer ${googleToken}` }
    });
    
    if (!peopleRes.ok) {
       console.error("Failed to fetch Google Contacts", await peopleRes.text());
       return NextResponse.json({ error: 'Failed to fetch Google Contacts' }, { status: 500 });
    }

    const peopleData = await peopleRes.json();
    const connections = peopleData.connections || [];
    
    // Fuzzy match all potentials
    const matches = connections.filter((conn: any) => {
      const names = conn.names || [];
      return names.some((n: any) => 
        n.givenName?.toLowerCase() === targetName.toLowerCase() || 
        n.displayName?.toLowerCase().includes(targetName.toLowerCase())
      );
    });

    const results = matches.map((match: any) => {
        const name = match.names?.[0]?.displayName || targetName;
        let phone = match.phoneNumbers?.[0]?.value || null;
        const email = match.emailAddresses?.[0]?.value || null;

        if (phone) {
            // Clean phone number (Vapi expects e.g., +1234567890)
            phone = phone.replace(/[^\d+]/g, '');
            if (!phone.startsWith('+')) phone = '+' + phone;
        }

        return { name, phone, email };
    });

    return NextResponse.json({ matches: results, extractedName: targetName });

  } catch (error) {
    console.error('Error resolving contacts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
