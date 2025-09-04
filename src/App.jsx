import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [transcript, setTranscript] = useState('');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('🔄 Attempting WebSocket connection...');
        ws.current = new WebSocket("wss://magix-trix.onrender.com");

        ws.current.onopen = () => {
          console.log('✅ WebSocket Connected');
          clearInterval(reconnectInterval.current);
          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("📩 Received message:", data);
          
          if (data.type === 'transcript' && role === 'magician') {
            console.log("📜 Full transcript received:", data.word);
            setTranscript(data.word);

            if (navigator.vibrate) navigator.vibrate(200);
          }
          
          if (data.type === 'error') {
            console.error("❌ Server error:", data.message);
          }
        };

        ws.current.onclose = () => {
          console.log('❌ WebSocket Disconnected');
          // Attempt to reconnect every 3 seconds
          reconnectInterval.current = setInterval(connect, 3000);
        };

        ws.current.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };
      };
      
      connect();
      
      return () => {
        clearInterval(reconnectInterval.current);
        if (ws.current) ws.current.close();
      };
    }
  }, [sessionId, role]);

  return { ws, transcript };
};

// Main App Component
function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
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

  const { ws, transcript } = useWebSocket(sessionId, role);

  // Update connection status based on WebSocket state
  useEffect(() => {
    if (ws.current) {
      const updateStatus = () => {
        setConnectionStatus(
          ws.current.readyState === WebSocket.OPEN ? 'connected' : 
          ws.current.readyState === WebSocket.CONNECTING ? 'connecting' : 'disconnected'
        );
      };
      
      updateStatus();
      const interval = setInterval(updateStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [ws.current]);

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
      try {
        console.log("🎤 Requesting microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("✅ Microphone access granted");

        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
            const arrayBuffer = await event.data.arrayBuffer();
            console.log("📤 Sending audio chunk:", arrayBuffer.byteLength, "bytes");
            ws.current.send(arrayBuffer);
          }
        };

        mediaRecorderRef.current.start(250);
        setIsRecording(true);
        console.log("⏺️ Recording started");
      } catch (error) {
        console.error("❌ Mic error:", error);
        alert("Could not access the microphone. Please allow microphone permissions.");
      }
    } else {
      console.warn("⚠️ WebSocket not open, cannot record.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      console.log("⏹️ Recording stopped");
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
        </div>
        
        <h1>Speak a Word</h1>
        <p>Press and hold the button, say any word, then release.</p>

        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onMouseDown={startRecording}
          onTouchStart={startRecording}
          onMouseUp={stopRecording}
          onTouchEnd={stopRecording}
          aria-label="Hold to record your word"
          aria-pressed={isRecording}
        >
          {isRecording ? '🎤🔴' : '🎤'}
        </button>
        
        {isRecording && <p className="recording-status">Recording... Speak now</p>}
      </div>
    );
  }

  return null;
}

export default App;