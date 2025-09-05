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
  const [isMicAvailable, setIsMicAvailable] = useState(false);

  // Check microphone availability
  useEffect(() => {
    const checkMicrophone = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsMicAvailable(true);
      } catch (error) {
        console.warn('Microphone not available:', error);
        setIsMicAvailable(false);
      }
    };
    checkMicrophone();
  }, []);

  // Speech recognition hook
  const {
    transcript: speechTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
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
        type: 'test',
        message: speechTranscript, // ← Change 'word' to 'message'
        timestamp: Date.now()
      });
      ws.current.send(message);
      console.log('🎯 Sent test transcript:', speechTranscript);
    }
  }, [speechTranscript, role, ws]);

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
      return () => {
        if (ws.current) {
          ws.current.removeEventListener('message', handleMessage);
        }
      };
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

  // Start listening
  const startListening = () => {
    SpeechRecognition.startListening({ continuous: true });
  };

  // Stop listening
  const stopListening = () => {
    SpeechRecognition.stopListening();
    resetTranscript();
  };

  // Send test message
  const sendTestMessage = (message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const testMessage = JSON.stringify({
        type: 'test',
        message: message, 
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

        <div className="test-buttons">
          <h3>Test (For Debugging)</h3>
          <button onClick={() => sendTestMessage("Hello Magician!")} className="test-button">
            Test: Hello
          </button>
          <button onClick={() => sendTestMessage("Abracadabra!")} className="test-button">
            Test: Abracadabra
          </button>
        </div>
      </div>
    );
  }

  if (role === 'spectator') {
    if (!browserSupportsSpeechRecognition) {
      return (
        <div className="container center">
          <h1>Browser Not Supported</h1>
          <p>Please use Chrome, Edge, or Safari for speech recognition.</p>
        </div>
      );
    }

    if (!isMicrophoneAvailable || !isMicAvailable) {
      return (
        <div className="container center">
          <h1>Microphone Access Required</h1>
          <p>Please allow microphone permissions in your browser settings.</p>
          <button onClick={() => window.location.reload()} className="role-button">
            Reload After Granting Permission
          </button>
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
        <p>Press and hold the button, speak clearly, then release</p>

        <button
          className={`record-button ${listening ? 'recording' : ''}`}
          onMouseDown={startListening}
          onTouchStart={startListening}
          onMouseUp={stopListening}
          onTouchEnd={stopListening}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
        >
          {listening ? '🎤🔴' : '🎤'}
        </button>

        {listening ? (
          <div className="listening-status">
            <p>🎧 Listening... Speak now</p>
            <div className="current-transcript">
              {speechTranscript || "Waiting for speech..."}
            </div>
          </div>
        ) : (
          <p className="instruction">Release the button when done speaking</p>
        )}

        <div className="test-buttons">
          <h3>Test Messages</h3>
          <button onClick={() => sendTestMessage("TEST: Hello Magician!")} className="test-button">
            Send Test Message
          </button>
          <button onClick={() => sendTestMessage("TEST: Magic Word!")} className="test-button">
            Send Magic Word
          </button>
        </div>

        <div className="instructions">
          <h3>How to Use:</h3>
          <ol>
            <li>Press and hold the microphone button</li>
            <li>Speak clearly into your microphone</li>
            <li>Release the button when done</li>
            <li>Your words will magically appear to the magician!</li>
          </ol>
        </div>
      </div>
    );
  }

  return null;
}

export default App;