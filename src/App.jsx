import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [transcript, setTranscript] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isDeepgramReady, setIsDeepgramReady] = useState(false);
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('🔄 Attempting WebSocket connection...');
        // Use wss for production, ws for local development
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = process.env.NODE_ENV === 'production' 
          ? "wss://magix-trix.onrender.com" 
          : `${protocol}//${window.location.hostname}:3001`;
        
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log('✅ WebSocket Connected');
          setConnectionStatus('connected');
          clearInterval(reconnectInterval.current);
          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("📩 Received message:", data);
            
            if (data.type === 'transcript' && role === 'magician') {
              console.log("📜 Full transcript received:", data.word);
              setTranscript(data.word);
              if (navigator.vibrate) navigator.vibrate(200);
            }
            
            // Log what spectator said in their console
            if (data.type === 'transcript_sent' && role === 'spectator') {
              console.log("🎯 You said:", data.word);
              console.log("✅ Your word was sent to the magician!");
            }
            
            if (data.type === 'deepgram_ready') {
              console.log("✅ Deepgram is ready for speech recognition");
              setIsDeepgramReady(true);
            }
            
            if (data.type === 'error') {
              console.error("❌ Server error:", data.message);
              setIsDeepgramReady(false);
            }
            
            if (data.type === 'joined') {
              console.log("✅ Successfully joined session:", data.sessionId);
            }
          } catch (error) {
            console.error("❌ Error parsing message:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          console.log('❌ WebSocket Disconnected');
          setConnectionStatus('disconnected');
          setIsDeepgramReady(false);
          // Attempt to reconnect every 3 seconds
          reconnectInterval.current = setInterval(connect, 3000);
        };

        ws.current.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setConnectionStatus('error');
          setIsDeepgramReady(false);
        };
      };
      
      connect();
      
      return () => {
        clearInterval(reconnectInterval.current);
        if (ws.current) ws.current.close();
      };
    }
  }, [sessionId, role]);

  return { ws, transcript, connectionStatus, isDeepgramReady };
};

// Main App Component
function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [spokenWords, setSpokenWords] = useState([]);
  const mediaRecorderRef = useRef(null);

  // Parse URL for role/session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const sessionParam = params.get('session');
    if (roleParam && sessionParam) {
      setRole(roleParam);
      setSessionId(sessionParam);
    }
  }, []);

  const { ws, transcript, connectionStatus, isDeepgramReady } = useWebSocket(sessionId, role);

  // Create a new session as magician
  const createSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8);
    window.location.href = `?role=magician&session=${newSessionId}`;
  };

  // Share link for spectator
  const getSpectatorLink = () =>
    `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // Copy link to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(getSpectatorLink());
    alert('Link copied to clipboard!');
  };

  // Start recording
  const startRecording = async () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Check if Deepgram is ready (for spectators)
      if (role === 'spectator' && !isDeepgramReady) {
        console.warn("⚠️ Deepgram not ready yet, waiting...");
        alert("Speech recognition is still initializing. Please wait a moment and try again.");
        return;
      }

      try {
        console.log("🎤 Requesting microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            sampleRate: 48000,
            sampleSize: 16
          } 
        });
        console.log("✅ Microphone access granted");

        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
            const arrayBuffer = await event.data.arrayBuffer();
            console.log("📤 Sending audio chunk:", arrayBuffer.byteLength, "bytes");
            
            // For spectators, check if Deepgram is ready before sending
            if (role === 'spectator' && !isDeepgramReady) {
              console.warn("⚠️ Deepgram not ready, skipping audio chunk");
              return;
            }
            
            ws.current.send(arrayBuffer);
          }
        };

        mediaRecorderRef.current.start(250);
        setIsRecording(true);
        console.log("⏺️ Recording started");
        
        // Log for spectator
        if (role === 'spectator') {
          console.log("🎤 Recording started - speak now!");
        }
      } catch (error) {
        console.error("❌ Mic error:", error);
        alert("Could not access the microphone. Please allow microphone permissions.");
      }
    } else {
      console.warn("⚠️ WebSocket not open, cannot record.");
      console.log("WebSocket state:", ws.current ? ws.current.readyState : "no WebSocket");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      console.log("⏹️ Recording stopped");
      
      // Log for spectator
      if (role === 'spectator') {
        console.log("⏹️ Recording stopped - processing your speech...");
      }
    }
    setIsRecording(false);
  };

  // UI rendering
  if (!role) {
    return (
      <div className="container center">
        <h1>AI Magic Trick</h1>
        <p>Create a session as the magician and share the link with spectators</p>
        <button onClick={createSession} className="role-button">
          Create Magic Session
        </button>
      </div>
    );
  }

  if (role === 'magician') {
    return (
      <div className="container magician-view">
        <div className="header">
          <h1>Magic Session: {sessionId}</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>
        
        <h2>The Secret Word</h2>
        <div className="transcript-box">
          {transcript ? <h1>"{transcript}"</h1> : <p>Waiting for the spectator to speak a word...</p>}
        </div>

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <div className="link-container">
            <input type="text" value={getSpectatorLink()} readOnly />
            <button onClick={copyLink} className="copy-button">Copy</button>
          </div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
              getSpectatorLink()
            )}`}
            alt="Spectator QR Code"
          />
        </div>
        
        <div className="debug-info">
          <h3>Debug Information</h3>
          <p>Session ID: {sessionId}</p>
          <p>Role: {role}</p>
          <p>Connection: {connectionStatus}</p>
          <p>Last word: {transcript || "None yet"}</p>
        </div>
      </div>
    );
  }

  if (role === 'spectator') {
    return (
      <div className="container center spectator-view">
        <div className="header">
          <h1>Session: {sessionId}</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
          {!isDeepgramReady && (
            <div className="deepgram-status">
              <p>Initializing speech recognition... {isDeepgramReady ? '✅ Ready' : '⏳ Please wait'}</p>
            </div>
          )}
        </div>
        
        <h1>Speak a Word</h1>
        <p>Press and hold the button, say any word, then release.</p>
        <p className="instruction">Check your browser console to see what you said!</p>

        <button
          className={`record-button ${isRecording ? 'recording' : ''} ${!isDeepgramReady ? 'disabled' : ''}`}
          onMouseDown={startRecording}
          onTouchStart={startRecording}
          onMouseUp={stopRecording}
          onTouchEnd={stopRecording}
          aria-label="Hold to record your word"
          aria-pressed={isRecording}
          disabled={!isDeepgramReady}
        >
          {isRecording ? '🎤🔴' : '🎤'}
        </button>
        
        {isRecording && <p className="recording-status">Recording... Speak now</p>}
        
        {!isDeepgramReady && (
          <div className="warning">
            <p>⚠️ Speech recognition is initializing. Please wait before speaking.</p>
          </div>
        )}
    
        
        <div className="debug-info">
          <h3>Debug Information</h3>
          <p>Session ID: {sessionId}</p>
          <p>Role: {role}</p>
          <p>Connection: {connectionStatus}</p>
          <p>Deepgram: {isDeepgramReady ? '✅ Ready' : '❌ Not Ready'}</p>
          <p>Recording: {isRecording ? "Yes" : "No"}</p>
        </div>
      </div>
    );
  }

  return null;
}

export default App;