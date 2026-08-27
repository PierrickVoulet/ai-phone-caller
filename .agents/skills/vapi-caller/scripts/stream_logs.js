const fs = require('fs');
const path = require('path');

const outFile = process.argv[2];
if (!outFile) {
  console.error("Please provide an output file path.");
  process.exit(1);
}

// Make sure output directory exists
const outDir = path.dirname(outFile);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let lastLogCount = 0;
let lastKnownStatus = "Waiting for call to start...";

function formatLogs(rawLogs) {
  const latestStatusLog = rawLogs.find(l => l.type === 'status-update');
  if (latestStatusLog?.data?.status) {
    lastKnownStatus = latestStatusLog.data.status;
  }

  const processed = [];
  for (const log of rawLogs) {
    if (log.type === 'transcript') {
      if (log.data?.transcriptType === 'partial') {
        continue;
      }
      if (processed.length > 0) {
        const lastLog = processed[processed.length - 1];
        if (lastLog.type === 'transcript' && lastLog.data?.role === log.data?.role) {
          lastLog.data.transcript = log.data.transcript + ' ' + lastLog.data.transcript;
          continue;
        }
      }
    }
    processed.push(JSON.parse(JSON.stringify(log)));
  }

  let markdown = `# Live Call Logs\n\n`;
  markdown += `**Status**: \`${lastKnownStatus}\`\n\n`;
  markdown += `---\n\n`;

  if (processed.length === 0) {
    markdown += `*Waiting for call events...*\n`;
    return markdown;
  }

  // We want to render them oldest to newest (top to bottom) so it reads like a script
  const readingOrder = [...processed].reverse();

  for (const log of readingOrder) {
    const data = log.data;
    if (!data) continue;

    if (log.type === "transcript") {
      const icon = data.role === 'assistant' ? '🤖 **Agent:**' : '👤 **User:**';
      markdown += `${icon} ${data.transcript}\n\n`;
    } else if (log.type === "status-update") {
      markdown += `*Status changed to: ${data.status}*\n\n`;
    } else if (log.type === "tool-calls") {
      const toolCall = data.toolWithToolCallList?.[0]?.toolCall || data.toolCallList?.[0] || data.toolCalls?.[0];
      if (toolCall) {
        markdown += `> [!NOTE]\n> **🛠️ Tool Called:** \`${toolCall.function?.name}\`\n> \`\`\`json\n> ${JSON.stringify(toolCall.function?.arguments || {}, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n\n`;
      }
    } else if (log.type === "tool-calls-result") {
      markdown += `> [!TIP]\n> **✅ Tool Result:** \n> \`\`\`json\n> ${JSON.stringify(data.result || data.results || {}, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n\n`;
    } else if (log.type === "end-of-call-report") {
      markdown += `> [!IMPORTANT]\n> **📞 Call Ended:** ${data.summary || 'Completed'}\n\n`;
    }
  }

  return markdown;
}

async function pollLogs() {
  try {
    const res = await fetch('http://localhost:3000/api/vapi/webhook');
    if (!res.ok) return;
    const logs = await res.json();
    
    // Always write on first pass, or if log array length changes
    // (We could do deeper checks, but this is simple enough for a live stream)
    const newMarkdown = formatLogs(logs);
    fs.writeFileSync(outFile, newMarkdown, 'utf8');
    
  } catch (err) {
    // silently ignore fetch errors so we keep polling
  }
}

// Poll every 1.5 seconds
setInterval(pollLogs, 1500);
pollLogs();
console.log(`Streaming logs to ${outFile}...`);
