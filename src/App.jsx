import React, { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './App.css';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [transcript, setTranscript] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('Attempting WebSocket connection...');
        // const wsUrl = "ws://localhost:3001";
        const wsUrl = "wss://magix-trix.onrender.com"
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log('WebSocket Connected');
          setConnectionStatus('connected');
          clearInterval(reconnectInterval.current);
          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript' && role === 'magician') {
              console.log("Full transcript received:", data.word);
              setTranscript(data.word);
              if (navigator.vibrate) navigator.vibrate(200);
            }

            if (data.type === 'joined') {
              console.log("Successfully joined session:", data.sessionId);
            }

            if (data.type === 'summary' && role === 'spectator') {
              console.log("Summary Data received:", data);
              navigator.vibrate([2000, 100, 2000]);
              if (data.topics && data.topics.length > 0) {
                window.location.href = `https://www.google.com/search?q=${data.topics[0]}`;
              } else {
                alert("Couldn't identify a clear topic. Please try again.");
              }
            }
          } catch (error) {
            console.error("Error parsing message:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          console.log('WebSocket Disconnected');
          setConnectionStatus('disconnected');
          reconnectInterval.current = setInterval(connect, 3000);
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
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

  return { ws, transcript, connectionStatus };
};

function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fullSpeech, setFullSpeech] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const silenceTimerRef = useRef(null);

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

  // Auto-stop after 5 seconds of silence
  useEffect(() => {
    if (listening) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(() => {
        if (listening) {
          console.log('⏰ No speech detected for 5 seconds, stopping...');
          stopListening();
        }
      }, 5000);
    }
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [listening, speechTranscript]);

  // Send transcript updates to magician
  useEffect(() => {
    if (role === 'spectator' && speechTranscript && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'transcript',
        word: speechTranscript,
        timestamp: Date.now()
      });
      ws.current.send(message);
      console.log('Sent transcript:', speechTranscript);

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (listening) {
            stopListening();
          }
        }, 10000);
      }
    }
  }, [speechTranscript, role, ws, listening]);

  // Handle magician view incoming transcripts
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

  // Create new session (magician)
  const createSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8);
    window.location.href = `?role=magician&session=${newSessionId}`;
  };

  // Share link for spectator
  const getSpectatorLink = () =>
    `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(getSpectatorLink());
    alert('Link copied to clipboard!');
  };

  const startListening = async () => {
    try {
      console.log('Microphone permission granted');
      SpeechRecognition.startListening({ continuous: true });
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please allow microphone permissions to use speech recognition');
    }
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    SpeechRecognition.abort(); //force stop

    if (role === 'spectator' && (fullSpeech || speechTranscript) && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'summarize',
        text: fullSpeech || speechTranscript,
        timestamp: Date.now()
      });
      ws.current.send(message);
    }

    resetTranscript();
    setFullSpeech('');
    setLastTranscript('');

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // Build full speech
  useEffect(() => {
    if (speechTranscript && speechTranscript !== lastTranscript) {
      if (!fullSpeech.includes(speechTranscript)) {
        setFullSpeech(prev => prev ? prev + ' ' + speechTranscript : speechTranscript);
        setLastTranscript(speechTranscript);
        console.log('Added to full speech:', speechTranscript);
      }
    }
  }, [speechTranscript, lastTranscript, fullSpeech]);

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
          <p>Please use Chrome, Edge, or Safari for speech recognition.</p>
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
        <h1>Speak any Word</h1>
        <div className="recording-controls">
          <button
            onClick={listening ? stopListening : startListening}
            className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
          >
            {listening ? '⏹️ Stop Listening' : '🎤 Start Speaking'}
          </button>
        </div>
        {listening && (
          <div className="listening-status">
            <div className="current-transcript">
              {speechTranscript || "Waiting for speech..."}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default App;
