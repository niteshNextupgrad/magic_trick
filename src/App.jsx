import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    if (sessionId && role) {
      ws.current = new WebSocket("wss://magix-trix.onrender.com");

      ws.current.onopen = () => {
        console.log('✅ WebSocket Connected');
        ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript' && role === 'magician') {
          console.log("📜 Transcript received:", data.word);
          setTranscript(data.word);

          if (navigator.vibrate) navigator.vibrate(200);
        }
      };

      ws.current.onclose = () => console.log('❌ WebSocket Disconnected');

      return () => ws.current.close();
    }
  }, [sessionId, role]);

  return { ws, transcript }; // return ref, not ws.current
};

// Main App Component
function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
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

  // Create a new session as magician
  const createSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8);
    window.location.href = `?role=magician&session=${newSessionId}`;
  };

  // Share link for spectator
  const getSpectatorLink = () =>
    `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

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
            const arrayBuffer = await event.data.arrayBuffer(); // convert Blob → ArrayBuffer
            ws.current.send(arrayBuffer);
          }
        };

        mediaRecorderRef.current.start(250); // send every 250ms
        setIsRecording(true);
      } catch (error) {
        console.error("Mic error:", error);
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
    }
    setIsRecording(false);
  };

  // UI rendering
  if (!role) {
    return (
      <div className="container center">
        <h1>AI Magic Trick</h1>
        <button onClick={createSession} className="role-button">
          Create Magic Session
        </button>
      </div>
    );
  }

  if (role === 'magician') {
    return (
      <div className="container magician-view">
        <h2>The Secret</h2>
        <div className="transcript-box">
          {transcript ? <h1>{transcript}</h1> : <p>Waiting for the word...</p>}
        </div>

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <input type="text" value={getSpectatorLink()} readOnly />
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
        <h1>Speak a Word</h1>
        <p>Press and hold the button, say any word, then release.</p>

        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onMouseDown={startRecording}
          onTouchStart={startRecording}
          onMouseUp={stopRecording}
          onTouchEnd={stopRecording}
        >
          🎤
        </button>
      </div>
    );
  }

  return null;
}

export default App;
