const fs = require('fs');

async function waitForEnd() {
  let initialEndsCount = 0;
  
  try {
    const res = await fetch('http://localhost:3000/api/vapi/webhook');
    if (res.ok) {
      const logs = await res.json();
      initialEndsCount = logs.filter(l => l.type === 'status-update' && l.data?.status === 'ended').length;
    }
  } catch (err) {}

  while (true) {
    try {
      const res = await fetch('http://localhost:3000/api/vapi/webhook');
      if (res.ok) {
        const logs = await res.json();
        const ends = logs.filter(l => l.type === 'status-update' && l.data?.status === 'ended');
        
        // If the user clears the logs mid-call, our initial count is no longer valid.
        // We detect this if the total number of ends suddenly drops below our initial count.
        if (ends.length < initialEndsCount) {
          initialEndsCount = ends.length;
        }
        
        if (ends.length > initialEndsCount || (initialEndsCount === 0 && ends.length > 0)) {
           // We found a new end-of-call status!
           let callLogs = [];
           for (const log of logs) {
             callLogs.push(log);
             if (log.type === 'status-update' && log.data?.status === 'started') {
               // We reached the start of the most recent call
               break;
             }
           }
           
           callLogs.reverse(); // chronological order
           
           let out = [];
           for (const log of callLogs) {
             if (log.type === 'transcript' && log.data?.transcriptType === 'final') {
               out.push(`[${log.data.role}]: ${log.data.transcript}`);
             } else if (log.type === 'tool-calls') {
               const call = log.data.toolWithToolCallList?.[0]?.toolCall;
               if (call) {
                 out.push(`[tool_call]: ${call.function?.name} => ${JSON.stringify(call.function?.arguments)}`);
               }
             }
           }
           
           console.log("RAW_CALL_LOGS_START");
           console.log(out.join('\n'));
           console.log("RAW_CALL_LOGS_END");
           process.exit(0);
        }
      }
    } catch (err) {}
    await new Promise(r => setTimeout(r, 2000));
  }
}

waitForEnd();
