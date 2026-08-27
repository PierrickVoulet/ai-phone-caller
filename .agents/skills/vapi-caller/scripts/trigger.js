const fs = require('fs');
const path = require('path');

let params = null;

try {
  const brainDir = path.join(require('os').homedir(), '.gemini', 'antigravity-ide', 'brain');
  const folders = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
  folders.sort((a, b) => fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs);
  if (folders.length > 0) {
    const scratchFile = path.join(brainDir, folders[0], 'scratch', 'vapi_trigger.json');
    if (fs.existsSync(scratchFile)) {
      params = JSON.parse(fs.readFileSync(scratchFile, 'utf8'));
    }
  }
} catch (e) {
  // Ignored
}

if (process.argv.length > 2) {
  try {
    params = JSON.parse(process.argv[2]);
  } catch (e) {
    // If not JSON, treat as instruction
    params = { instruction: process.argv[2], targetPhone: process.argv[3], targetEmail: process.argv[4] };
  }
}

if (!params || !params.instruction) {
  console.error("Please provide an instruction string via args or in the scratch directory (vapi_trigger.json)");
  process.exit(1);
}

const contextPath = path.join(process.cwd(), 'vapi-context.json');
let context = {};
try {
  context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
} catch (e) {
  console.warn("Could not read vapi-context.json, using defaults.");
}

async function triggerCall() {
  const { instruction, targetPhone, targetEmail, targetName } = params;
  const phoneNumber = targetPhone || "TESTING";
  const finalTargetEmail = targetEmail || null;
  const finalTargetName = targetName || context.targetName;
  delete context.targetName;

  if (!phoneNumber) {
    console.error("Missing phoneNumber in arguments or vapi-context.json");
    process.exit(1);
  }

  try {
    const res = await fetch('http://localhost:3000/api/playbook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phoneNumber, targetContactEmail: finalTargetEmail || null, targetContactName: finalTargetName || null, instruction, context })
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to trigger call: ${res.status} ${text}`);
    }
    
    const data = await res.json();
    console.log("Call successfully triggered!");
    console.log("Response:", data);
  } catch (error) {
    console.error("Error triggering call:", error.message);
    process.exit(1);
  }
}

triggerCall();
