import React, { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './App.css';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('🔄 Attempting WebSocket connection...');
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
          } catch (error) {
            console.error("❌ Error parsing message:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          console.log('❌ WebSocket Disconnected');
          setConnectionStatus('disconnected');
          reconnectInterval.current = setInterval(connect, 3000);
        };

        ws.current.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setConnectionStatus('error');
        };
      };

      connect();

      return () => {
        clearInterval(reconnectInterval.current);
        if (ws.current) ws.current.close();
      };
    }
  }, [sessionId, role]);

  return { ws, connectionStatus };
};

// Main App Component
function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');

  // Speech recognition hook
  const {
    transcript: speechTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const { ws, connectionStatus } = useWebSocket(sessionId, role);

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

  // Send transcript to magician when speech is detected
  useEffect(() => {
    if (role === 'spectator' && speechTranscript && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'transcript',
        word: speechTranscript,
        timestamp: Date.now()
      });
      ws.current.send(message);
      console.log('🎯 Sent transcript:', speechTranscript);
      resetTranscript();
    }
  }, [speechTranscript, role, ws, resetTranscript]);

  // Handle incoming transcripts (for magician)
  useEffect(() => {
    if (ws.current) {
      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript' && role === 'magician') {
            setTranscript(data.word);
            console.log('📜 Received transcript:', data.word);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.current.addEventListener('message', handleMessage);
      return () => ws.current.removeEventListener('message', handleMessage);
    }
  }, [role, ws]);

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

  // Start/stop listening
  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({ continuous: true });
    }
  };

  // Send test message
  const sendTestMessage = (message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const testMessage = JSON.stringify({
        type: 'test',
        word: message,
        timestamp: Date.now()
      });
      ws.current.send(testMessage);
      console.log('🧪 Sent test message:', message);
    }
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
    if (!browserSupportsSpeechRecognition) {
      return (
        <div className="container center">
          <h1>Browser Not Supported</h1>
          <p>Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.</p>
        </div>
      );
    }

    return (
      <div className="container center spectator-view">
        <div className="header">
          <h1>Session: {sessionId}</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>

        <h1>Speak a Word</h1>
        <p>Click the button and speak clearly into your microphone</p>

        <button
          className={`record-button ${listening ? 'recording' : ''}`}
          onClick={toggleListening}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
        >
          {listening ? '🎤🔴' : '🎤'}
          <span>{listening ? ' Stop' : ' Speak'}</span>
        </button>

        {listening && (
          <div className="listening-status">
            <p>🎧 Listening... Speak now</p>
            <p className="current-text">{speechTranscript || "Waiting for speech..."}</p>
          </div>
        )}

        <div className="test-buttons">
          <h3>Test Messages</h3>
          <button onClick={() => sendTestMessage("Hello Magician!")} className="test-button">
            Send "Hello"
          </button>
          <button onClick={() => sendTestMessage("Abracadabra!")} className="test-button">
            Send "Abracadabra"
          </button>
          <button onClick={() => sendTestMessage("The secret word is...")} className="test-button">
            Send "Secret Word"
          </button>
        </div>

      </div>
    );
  }

  return null;
}

export default App;