---
name: vapi-caller
description: >-
  Use this skill when the user wants to trigger a Vapi autonomous phone call, run a test call, change the call context/settings, or stream the live call logs into the chat.
---

# Vapi Autonomous Phone Caller

This skill allows you to initiate autonomous phone calls via Vapi by bypassing the custom React UI and sending instructions directly to the Next.js backend.

## Instructions

**CRITICAL RULE**: Be as autonomous as possible! Do NOT ask for the user's consent or permission before running commands (like `resolve.js`, `trigger.js`, or `stream_logs.js`). The ONLY time you should wait for the user's input is during Step B to confirm which contact to call. Otherwise, execute the tool calls silently and immediately.

1. **Setting Context**:
   If the user asks to change their settings (like meeting duration, business hours, lunch hours, or their name), edit the `vapi-context.json` file in the workspace root.

2. **Triggering a Call**:
   If the user provides an instruction to call someone (e.g., "Call John Doe and reschedule my 1:1" or "Run Test 1"):
   - **Step A: Resolve Contact**: Use the `write_to_file` tool to save the user's instruction into a file named `scratch/vapi_instruction.txt` in your brain artifacts directory. Then, run the resolve script with NO arguments:
     ```bash
     node .agents/skills/vapi-caller/scripts/resolve.js
     ```
     This static command ensures the IDE's permission prompt can be "Always Allowed" once and for all.
   - The script will output a JSON array of matched contacts.
   - If the array is empty, ask if they want to call the testing account.
   - If multiple contacts match, present them to the user and ask which one to call.

   - **Step B: Confirm Contact**: Wait for the user to explicitly confirm which contact they want to proceed with. DO NOT dispatch the call until they respond.
   
   - **Step C: Dispatch Call**: Once the user confirms, use the `write_to_file` tool to create a file named `scratch/vapi_trigger.json` in your brain artifacts directory containing:
     ```json
     {
       "instruction": "<instruction>",
       "targetPhone": "<target_phone>",
       "targetEmail": "<target_contact_email>",
       "targetName": "<target_contact_name>"
     }
     ```
     - For real contacts: pass their resolved phone, email, and name.
     - For the testing account: pass `"targetPhone": "TESTING"`. You may omit `targetEmail` and `targetName` unless the user specifies overrides.
     Then, run the trigger script with NO arguments:
     ```bash
     node .agents/skills/vapi-caller/scripts/trigger.js
     ```
   - The trigger script will return success if the call is initiated.

3. **Streaming Live Logs & Summarizing**:
   As soon as you successfully trigger a call, you MUST do TWO things:
   - Run the log streamer as a daemon (using `run_command` with `IsDaemon: true`) to stream the conversation:
     ```bash
     node .agents/skills/vapi-caller/scripts/stream_logs.js "<absolute-path-to-artifacts-dir>/live_call_logs.md"
     ```
     Provide the user with a markdown link to the `live_call_logs.md` artifact so they can view it.
   - Run the call summary waiter as a NORMAL background task (using `run_command` with `IsDaemon: false`):
     ```bash
     node .agents/skills/vapi-caller/scripts/wait_for_call_end.js
     ```
     When this script completes, it will output the raw collected transcript of the call. The system will automatically wake you up when it finishes. You MUST read this raw output and then present a concise summary of the call to the user in the chat. Do NOT include technical details (like tools used, execution notes, or exact event titles). Just include what matters to a human: who was called, what was achieved, and when it was scheduled.

4. **Clearing Logs**:
   If the user asks to clear the logs:
   - Run a DELETE request against the webhook (using `curl.exe` for Windows PowerShell compatibility):
     ```bash
     curl.exe -X DELETE http://localhost:3000/api/vapi/webhook
     ```
   - And also kill the background log streamer task if it is running.
