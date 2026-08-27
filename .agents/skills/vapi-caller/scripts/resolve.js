const fs = require('fs');
const path = require('path');

async function resolveContact() {
  const brainDir = path.join(require('os').homedir(), '.gemini', 'antigravity-ide', 'brain');
  let instruction = '';

  try {
    const folders = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
    folders.sort((a, b) => fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs);
    if (folders.length > 0) {
      const scratchFile = path.join(brainDir, folders[0], 'scratch', 'vapi_instruction.txt');
      if (fs.existsSync(scratchFile)) {
        instruction = fs.readFileSync(scratchFile, 'utf8').trim();
      }
    }
  } catch (e) {
    // Ignored
  }

  if (process.argv.length > 2) {
    instruction = process.argv[2];
  }

  if (!instruction) {
    console.error("Please provide an instruction as an argument or in the scratch directory (vapi_instruction.txt)");
    process.exit(1);
  }

  try {
    const res = await fetch('http://localhost:3000/api/contacts/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ instruction })
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to resolve contact: ${res.status} ${text}`);
    }
    
    const data = await res.json();
    console.log(JSON.stringify(data.matches || [], null, 2));
  } catch (error) {
    console.error("Error resolving contact:", error.message);
    process.exit(1);
  }
}

resolveContact();
