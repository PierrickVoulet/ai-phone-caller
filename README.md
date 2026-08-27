# Autonomous AI Executive Assistant

This project is a Next.js web application that acts as an autonomous AI Executive Assistant. It can parse natural language instructions, automatically look up colleagues' contact information, call them on the phone using conversational AI, negotiate meeting times based on your real-time calendar availability, and automatically schedule calendar events.

## Features

- **Natural Language Parsing**: Uses Google Gemini to extract the target person's name from unstructured instructions (e.g., "Call John and set up a 30-minute sync").
- **Google Contacts Integration**: Uses the Google People API to automatically find the correct phone number and email address for the target colleague.
- **Conversational Voice AI**: Uses Vapi.ai (powered by OpenAI `gpt-4o-mini` and Deepgram) to make outbound phone calls and engage in natural conversations.
- **Real-Time Calendar Sync**: Allows the AI assistant to use Google Calendar APIs mid-call to check your real-time availability across all your calendars, ensuring it never double-books you.
- **Automated Scheduling**: The AI can officially create calendar events and invite the colleague once a time is agreed upon during the call.
- **Live Call Dashboard**: A custom Next.js UI that displays live call transcripts, tool executions, and call statuses by polling a local webhook.

---

## Architecture Flow

1. **Frontend**: The user enters an instruction, configures business hours, and clicks the dispatch button.
2. **Contact Resolver (`/api/contacts/resolve`)**: Next.js backend uses Gemini to parse the name, then searches Google Contacts for the phone number.
3. **Playbook Dispatcher (`/api/playbook`)**: Builds a dynamic system prompt (the "playbook") with the user's local timezone, business hours, and instructions. It then calls the Vapi API to dispatch the outbound call.
4. **Vapi Webhook (`/api/vapi/webhook`)**: Receives real-time POST events from Vapi. It intercepts tool calls (`check_availability` and `create_calendar_event`) and executes them directly against the Google Calendar API, returning the results back to the live phone call. It also stores transcripts in memory for the frontend to poll.

---

## Prerequisites

To run this project, you will need:

1. **Node.js** (v18+)
2. **Google Cloud Console Project** with the following APIs enabled:
   - Google People API
   - Google Calendar API
3. **Google Gemini API Key**
4. **Vapi.ai Account** with an active Phone Number.
5. **ngrok** (or similar) to expose your local server for Vapi webhooks.

---

## Environment Variables

Create a `.env.local` file in the root directory and populate it with the following keys:

```env
# Google Authentication (OAuth2 Access Token with People and Calendar scopes)
GOOGLE_ACCESS_TOKEN="ya29.a0A..."

# Google Gemini API
GEMINI_API_KEY="AIzaSy..."

# Vapi API Credentials
VAPI_API_KEY="your-vapi-api-key"
VAPI_PHONE_NUMBER_ID="your-vapi-phone-number-id"

# Webhook Tunnel
NEXT_PUBLIC_BASE_URL="https://your-ngrok-url.ngrok-free.app"

# Testing Overrides (Optional: Used when a Google Contact cannot be found)
TESTING_PHONE_NUMBER="+1234567890"
TESTING_EMAIL="test@example.com"
TESTING_NAME="John Doe"
```

> **Note on Google Auth**: This application currently uses a raw `GOOGLE_ACCESS_TOKEN` for rapid prototyping. For a production deployment, you should implement a proper OAuth2 flow (e.g., using NextAuth.js) to retrieve and refresh access tokens securely.

---

## Local Development & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Expose Local Webhook
Vapi needs a public URL to send webhook events to during the live call. Use ngrok to expose port 3000:
```bash
ngrok http 3000
```
*Note: Ensure the ngrok URL matches the Server Tool URL hardcoded in the `src/app/api/playbook/route.ts` file.*

### 3. Start the Development Server
```bash
npm run dev
```

### 4. Use the Application
1. Open `http://localhost:3000` in your browser.
2. Configure your business hours and context settings.
3. Type an instruction like "Call John to set up a 15-minute sync for tomorrow."
4. Click the trigger button and watch the live transcript as the AI makes the call!
