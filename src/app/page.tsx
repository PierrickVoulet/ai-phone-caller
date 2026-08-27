"use client";

import { useState } from "react";

export default function Home() {
  const [extractedName, setExtractedName] = useState("");
  const [status, setStatus] = useState("");
  const [callId, setCallId] = useState("");
  const [logs, setLogs] = useState<any[]>([]);

  const [contactMatches, setContactMatches] = useState<any[] | null>(null);
  const [pendingInstruction, setPendingInstruction] = useState<string>("");

  // Context Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bizStart, setBizStart] = useState("9:00 AM");
  const [bizEnd, setBizEnd] = useState("5:00 PM");
  const [lunchStart, setLunchStart] = useState("12:00 PM");
  const [lunchEnd, setLunchEnd] = useState("1:00 PM");
  const [meetingDuration, setMeetingDuration] = useState("30-minute");

  const handlePlaybookGenerated = (instruction: string) => {
    handleCannedTest(instruction);
  };

  const handleCannedTest = async (goal: string) => {
    setPendingInstruction(goal);
    setStatus("Resolving contacts...");
    try {
      const res = await fetch("/api/contacts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: goal })
      });
      const data = await res.json();
      setContactMatches(data.matches || []);
      setExtractedName(data.extractedName || "");
      setStatus("Waiting for contact confirmation...");
    } catch (e: any) {
      setStatus(`Error resolving contacts: ${e.message}`);
      setContactMatches([]);
    }
  };

  const dispatchCall = async (goal: string, targetPhone: string, targetContactEmail: string | null, targetContactName: string | null) => {
    setContactMatches(null);
    if (!targetPhone) {
      alert("Please enter a phone number to call.");
      return;
    }

    setStatus("Dispatching call...");
    try {
      const res = await fetch("/api/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: targetPhone,
          targetContactEmail,
          targetContactName,
          instruction: goal,
          context: {
            bizStart,
            bizEnd,
            lunchStart,
            lunchEnd,
            meetingDuration,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(`Call dispatched successfully! Call ID: ${data.callId}`);
        setCallId(data.callId);
        // Start polling for logs
        pollLogs();
      } else {
        setStatus(`Error: ${data.error || "Unknown error dispatching call."}`);
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const pollLogs = async () => {
    // Basic polling mechanism to fetch logs from our memory store
    setInterval(async () => {
      try {
        const res = await fetch("/api/vapi/webhook");
        const data = await res.json();
        setLogs(data);
      } catch (e) {
        console.error("Error fetching logs", e);
      }
    }, 3000);
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/vapi/webhook", { method: "DELETE" });
      setLogs([]);
      setStatus("Logs cleared.");
    } catch (e) {
      console.error("Error clearing logs", e);
    }
  };

  const processLogs = (rawLogs: any[]) => {
    const processed: any[] = [];
    for (const log of rawLogs) {
      if (log.type === 'transcript') {
        if (log.data?.transcriptType === 'partial') {
          continue; // Ignore partial transcripts
        }
        if (processed.length > 0) {
          const lastLog = processed[processed.length - 1];
          if (lastLog.type === 'transcript' && lastLog.data?.role === log.data?.role) {
            // Since we iterate newest-to-oldest, 'log' is OLDER than 'lastLog'
            // Therefore, the older log's text must come BEFORE the newer log's text
            lastLog.data.transcript = log.data.transcript + ' ' + lastLog.data.transcript;
            continue;
          }
        }
      }
      // Deep copy to avoid mutating the original logs state
      processed.push(JSON.parse(JSON.stringify(log)));
    }
    return processed;
  };

  const renderLogData = (log: any) => {
    try {
      const data = log.data;
      if (!data) return null;

      if (log.type === "transcript") {
        return (
          <div className="mt-1 flex items-start gap-2">
            <span className={`font-bold ${data.role === 'assistant' ? 'text-blue-400' : 'text-purple-400'}`}>
              {data.role === 'assistant' ? '🤖 Agent:' : '👤 User:'}
            </span>
            <span className="text-gray-300">{data.transcript}</span>
          </div>
        );
      }

      if (log.type === "status-update") {
        return <div className="mt-1 text-gray-400 italic">Status changed to: {data.status}</div>;
      }

      if (log.type === "tool-calls" || log.type === "tool-calls-result") {
        // Vapi tool calls payload has toolCallList
        const toolCalls = data.toolCallList || data.toolCalls || [];
        return (
          <div className="mt-1 space-y-1">
            {toolCalls.map((tc: any, i: number) => (
              <div key={i} className="bg-gray-800 p-2 rounded text-xs border border-gray-700">
                <span className="text-yellow-400 font-semibold flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  Tool Called: {tc.function?.name}
                </span>
                {tc.function?.arguments && (
                  <div className="text-gray-400 mt-1 pl-4">Args: {JSON.stringify(tc.function.arguments)}</div>
                )}
                {data.results && data.results[i] && (
                  <div className="text-green-400 mt-1 pl-4">Result: {JSON.stringify(data.results[i].result)}</div>
                )}
              </div>
            ))}
          </div>
        );
      }

      if (log.type === "end-of-call-report") {
        return (
          <div className="mt-1 bg-blue-900/30 border border-blue-800 p-2 rounded text-sm text-blue-200">
            <strong>Call Summary:</strong> {data.summary}
          </div>
        );
      }

      // Default fallback
      return (
        <pre className="text-gray-500 mt-1 text-xs overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8 dark:bg-gray-950 dark:text-gray-100">
      <main className="max-w-4xl mx-auto space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            AI Assistant Caller
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Test my scheduling skills with real-time phone calls and Google Workspace (Calendar, People).
          </p>
        </header>

        <section className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <div className="pt-4">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex items-center justify-between w-full text-left focus:outline-none"
            >
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Context Settings</h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isSettingsOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Business Start</label>
                  <input
                    type="text"
                    value={bizStart}
                    onChange={(e) => setBizStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Business End</label>
                  <input
                    type="text"
                    value={bizEnd}
                    onChange={(e) => setBizEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Lunch Start</label>
                  <input
                    type="text"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Lunch End</label>
                  <input
                    type="text"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Default Meeting Duration</label>
                  <input
                    type="text"
                    value={meetingDuration}
                    onChange={(e) => setMeetingDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="e.g. 30-minute"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleCannedTest(`Call John Doe from Engineering. Ask if he's free for a ${meetingDuration} sync tomorrow afternoon to discuss the new API architecture.`)}
                className="p-4 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl transition-colors text-left font-medium border border-blue-200 dark:border-blue-800 flex flex-col gap-2"
              >
                <span className="font-bold">Test me</span>
                <span className="text-xs opacity-80 font-normal leading-relaxed text-gray-700 dark:text-blue-200">
                  "Call John Doe from Engineering. Ask if he's free for a {meetingDuration} sync tomorrow afternoon to discuss the new API architecture."
                </span>
              </button>
            </div>
          </div>

          {contactMatches !== null && (
            <div className="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl space-y-4">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-400">Confirm Contact</h3>
              {contactMatches.length > 0 ? (
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  We found matching contacts for your instruction. Please select one to proceed:
                </p>
              ) : (
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  No matching contacts were found. You can proceed with the testing account.
                </p>
              )}
              <div className="space-y-3 mt-4">
                {contactMatches.map((match, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div>
                      <div className="font-bold">{match.name}</div>
                      <div className="text-xs text-gray-500">{match.email} | {match.phone}</div>
                    </div>
                    <button
                      onClick={() => dispatchCall(pendingInstruction, match.phone, match.email, match.name)}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      Call this contact
                    </button>
                  </div>
                ))}
                {contactMatches.length > 0 ? (
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                     <div>
                        <div className="font-bold">None of the above</div>
                        <div className="text-xs text-gray-500">Call the testing account instead</div>
                     </div>
                     <button
                       onClick={() => dispatchCall(pendingInstruction, "TESTING", null, extractedName)}
                       className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors text-sm"
                     >
                       Call Testing Account
                     </button>
                  </div>
                ) : (
                  <button
                    onClick={() => dispatchCall(pendingInstruction, "TESTING", null, extractedName)}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    Call Testing Account
                  </button>
                )}
              </div>
            </div>
          )}
        </section>



        {/* Logs */}
        <section className="bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-800 space-y-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-4">
              <span>Call Status & Logs</span>
              {status && <span className="text-sm font-normal text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full">{status}</span>}
            </h2>
            <button
              onClick={handleClearLogs}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors border border-gray-700"
            >
              Clear Logs
            </button>
          </div>
          <div className="h-[500px] overflow-y-auto bg-black rounded-xl p-4 font-mono text-sm space-y-2">
             {logs.length === 0 ? (
               <p className="text-gray-500">Waiting for call events...</p>
             ) : (
               processLogs(logs).map((log) => (
                 <div key={log.id} className="border-b border-gray-800 pb-2">
                   <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{" "}
                   <span className="text-green-400 font-bold opacity-50 text-xs uppercase tracking-wider">{log.type}</span>
                   {renderLogData(log)}
                 </div>
               ))
             )}
          </div>
        </section>
      </main>
    </div>
  );
}
