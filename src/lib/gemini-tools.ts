// Example of how the Gemini Multimodal Live API would be configured
// with the tool to dispatch a phone call.

export const dispatchPhoneCallTool = {
  name: 'dispatch_phone_call',
  description: 'Dispatches an AI phone call to a specified number with a given instruction playbook.',
  parameters: {
    type: 'object',
    properties: {
      phoneNumber: {
        type: 'string',
        description: 'The target phone number in E.164 format (e.g., +1234567890).'
      },
      instruction: {
        type: 'string',
        description: 'Detailed instructions for the phone agent on what to say, what questions to ask, and the goal of the call.'
      }
    },
    required: ['phoneNumber', 'instruction']
  }
};

export const checkMyAvailabilityTool = {
  name: 'check_my_availability',
  description: 'Checks the user\'s calendar to find out when they are busy or free over the next week. Use this before setting up a meeting to propose valid times.',
  parameters: {
    type: 'object',
    properties: {
      timeframe: {
        type: 'string',
        description: 'The timeframe to check, e.g., "next week", "tomorrow", "this afternoon"'
      }
    }
  }
};

// When Gemini Live calls this function, you would execute the same logic
// as the /api/playbook endpoint.
export async function executeDispatchPhoneCall(phoneNumber: string, instruction: string) {
  console.log(`[Tool Call] Dispatching call to ${phoneNumber} with instruction: ${instruction}`);
  // In a real implementation, you would call the Vapi API here
  // similar to src/app/api/playbook/route.ts
  return { success: true, message: `Playbook generated and call dispatched to ${phoneNumber}.` };
}
