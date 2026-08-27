"use client";

import { useEffect, useRef, useState } from "react";
import { checkMyAvailabilityTool, dispatchPhoneCallTool } from "../lib/gemini-tools";

export function useGeminiLive(onPlaybookGenerated: (phoneNumber: string, instruction: string) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  
  const recordContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);

  // Converts Base64 to Int16Array
  const base64ToInt16Array = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  };

  // Converts Int16Array to Base64
  const int16ArrayToBase64 = (int16Array: Int16Array) => {
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return window.btoa(binary);
  };

  const connect = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Missing NEXT_PUBLIC_GEMINI_API_KEY in .env.local");
      return;
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected to Gemini Live");
      setIsConnected(true);

      // Send initial setup
      ws.send(JSON.stringify({
        setup: {
          model: "models/gemini-2.0-flash-exp", // The primary model for Live API
          systemInstruction: {
            parts: [{
              text: "You are an expert internal Executive Assistant. Your job is to help the user dispatch an AI phone agent to call colleagues and set up internal meetings or syncs. Before calling the `dispatch_phone_call` tool, you MUST ensure you have a bulletproof playbook. First, if the user doesn't specify a time, you MUST use the `check_my_availability` tool to find out when the user is free for the next week. Then, ask the user to clarify any missing details (e.g. 'Should I call John Doe or Jane?', 'Do you want me to propose Tuesday afternoon?'). Only dispatch the call once you have the colleague's name, the meeting topic, and proposed time slots based on the calendar."
            }]
          },
          tools: [{ functionDeclarations: [dispatchPhoneCallTool, checkMyAvailabilityTool] }]
        }
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.serverContent?.modelTurn?.parts) {
        data.serverContent.modelTurn.parts.forEach((part: any) => {
          if (part.text) {
            setTranscript(prev => prev + part.text);
          }
          if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
            // Play audio chunk
            const pcm16 = base64ToInt16Array(part.inlineData.data);
            if (playbackNodeRef.current) {
              playbackNodeRef.current.port.postMessage(pcm16);
            }
          }
          if (part.functionCall) {
            const { name, args } = part.functionCall;
            
            if (name === "check_my_availability") {
              console.log("Gemini checking availability:", args);
              
              // Call our backend API to fetch real Google Calendar data
              fetch("/api/calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args)
              })
              .then(res => res.json())
              .then(calendarData => {
                const availability = calendarData.availability || calendarData.error;
                
                ws.send(JSON.stringify({
                  clientContent: {
                    turnComplete: true,
                    turns: [{
                      parts: [{
                        functionResponse: {
                          name: "check_my_availability",
                          response: { success: !calendarData.error, availability }
                        }
                      }]
                    }]
                  }
                }));
              })
              .catch(err => {
                ws.send(JSON.stringify({
                  clientContent: {
                    turnComplete: true,
                    turns: [{
                      parts: [{
                        functionResponse: {
                          name: "check_my_availability",
                          response: { success: false, error: err.message }
                        }
                      }]
                    }]
                  }
                }));
              });
            }
            
            if (name === "dispatch_phone_call") {
              console.log("Gemini triggered function call:", args);
              onPlaybookGenerated(args.phoneNumber, args.instruction);
              
              // Reply to function call
              ws.send(JSON.stringify({
                clientContent: {
                  turnComplete: true,
                  turns: [{
                    parts: [{
                      functionResponse: {
                        name: "dispatch_phone_call",
                        response: { success: true, message: "Playbook sent to Vapi agent successfully. Tell the user it is done." }
                      }
                    }]
                  }]
                }
              }));
            }
          }
        });
      }
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      setIsConnected(false);
      stopRecording();
    };
  };

  const startRecording = async () => {
    if (!isConnected) await connect();

    try {
      // 1. Setup Recording AudioContext (16kHz for Gemini input)
      recordContextRef.current = new AudioContext({ sampleRate: 16000 });
      await recordContextRef.current.audioWorklet.addModule("/pcm-recorder-processor.js");

      // 2. Setup Playback AudioContext (24kHz for Gemini output)
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      await playbackContextRef.current.audioWorklet.addModule("/pcm-playback-processor.js");
      
      playbackNodeRef.current = new AudioWorkletNode(playbackContextRef.current, "pcm-playback-processor");
      playbackNodeRef.current.connect(playbackContextRef.current.destination);

      // 3. Get Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });
      streamRef.current = stream;

      const source = recordContextRef.current.createMediaStreamSource(stream);
      recorderNodeRef.current = new AudioWorkletNode(recordContextRef.current, "pcm-recorder-processor");
      source.connect(recorderNodeRef.current);

      // Handle mic audio chunks
      recorderNodeRef.current.port.onmessage = (event) => {
        const pcm16 = event.data; // Int16Array
        const base64 = int16ArrayToBase64(pcm16);
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm;rate=16000",
                data: base64
              }]
            }
          }));
        }
      };

      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone", error);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (recordContextRef.current) recordContextRef.current.close();
    if (playbackContextRef.current) playbackContextRef.current.close();
    if (wsRef.current) wsRef.current.close();
  };

  return {
    isConnected,
    isRecording,
    transcript,
    startRecording,
    stopRecording
  };
}
