import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

// WebSocket connection hook
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('Attempting WebSocket connection...');
        // const wsUrl = "ws://localhost:3001"
        const wsUrl = "wss://magix-trix.onrender.com"
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log('WebSocket Connected');
          setConnectionStatus('connected');

          // Clear reconnect loop if connected
          if (reconnectInterval.current) {
            clearInterval(reconnectInterval.current);
            reconnectInterval.current = null;
          }

          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'joined') {
              console.log("Successfully joined session:", data.sessionId);
            }

            // Magician receives completion confirmation - can trigger vibration
            if (data.type === 'summarize_complete' && role === 'magician') {
              console.log("AI processing complete, topics:", data.topics);

              // Vibrate magician's device when processing is complete
              if (data.topics && data.topics.length > 0 && navigator.vibrate) {
                navigator.vibrate([1000, 200, 1000, 200, 1000]); //long vibrate to notify 
              } else if (navigator.vibrate) {
                navigator.vibrate([100, 200, 100]); // short vibrate 
              }
            }

            // Handle summary response - spectator gets redirected to Google search
            if (data.type === 'summary' && role === 'spectator') {
              console.log("Summary Data received:", data);
              if (data.topics && data.topics.length > 0) {
                window.location.href = `https://www.google.com/search?q=${data?.topics[0]}`;
              } else {
                console.log("Couldn't identify a clear topic. Please try again.");
              }
            }
          } catch (error) {
            console.error("Error parsing message:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          console.log('WebSocket Disconnected');
          setConnectionStatus('disconnected');

          // Prevent multiple reconnect loops
          if (!reconnectInterval.current) {
            reconnectInterval.current = setInterval(() => {
              console.log("🔄 Attempting reconnect...");
              connect();
            }, 3000);
          }
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

  return { ws, connectionStatus };
};

function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fullSpeech, setFullSpeech] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [browserSupportsSpeech, setBrowserSupportsSpeech] = useState(true);
  const silenceTimerRef = useRef(null);

  const { ws, connectionStatus } = useWebSocket(sessionId, role);

  // Use react-speech-recognition hook
  const {
    transcript: speechTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Update browser support state
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setBrowserSupportsSpeech(false);
    }
  }, [browserSupportsSpeechRecognition]);

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

  // Handle real-time speech transcription for magician
  useEffect(() => {
    if (role === 'magician' && speechTranscript) {
      // Reset silence timer on speech
      resetSilenceTimer();

      // Send speech to spectator in real-time
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: 'test',
            message: speechTranscript,
            timestamp: Date.now(),
          })
        );
      }

      // Update local transcript
      setTranscript(speechTranscript);
      setFullSpeech(speechTranscript); // Store the full speech for summarization
    }
  }, [speechTranscript, role, ws]);

  // Handle spectator receiving transcript
  useEffect(() => {
    if (role === 'spectator' && ws.current) {
      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript') {
            setTranscript(data.word);
          }
        } catch (error) {
          console.error("Error parsing message:", error);
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

  const resetSilenceTimer = () => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      console.log("Silent for 10s stopping...");
      stopListening();
    }, 10000); // 10 seconds
  };

  const startListening = () => {
    if (role === 'magician') {
      try {
        SpeechRecognition.startListening({ continuous: true });
        setIsListening(true);
        resetTranscript();
        setFullSpeech(''); // Reset full speech
        resetSilenceTimer();
        console.log("Started listening...");
      } catch (error) {
        console.error("Error starting recognition:", error);
      }
    }
  };

  const stopListening = () => {
    if (role === 'magician') {
      try {
        clearTimeout(silenceTimerRef.current);
        SpeechRecognition.stopListening();
        setIsListening(false);
        console.log("Stopped listening and sending transcript...");

        // Send the full transcript for summarization
        if (ws.current && ws.current.readyState === WebSocket.OPEN && fullSpeech.trim()) {
          ws.current.send(
            JSON.stringify({
              type: "summarize",
              text: fullSpeech,
              timestamp: Date.now(),
            })
          );
        }

        resetTranscript();
        setTranscript('');
      } catch (error) {
        console.error("Error stopping recognition:", error);
      }
    }
  };

  // Update isListening state based on speech recognition
  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

  // Create a new session as magician
  const createSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8);
    window.location.href = `?role=magician&session=${newSessionId}`;
  };

  // Share link for spectator
  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // Copy link to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(getSpectatorLink());
    alert('Link copied to clipboard!');
  };

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
    if (!browserSupportsSpeech) {
      return (
        <div className="container center">
          <h1>Your Browser Does Not Support Speech Recognition</h1>
        </div>
      );
    }

    return (
      <div className="container magician-view">
        <div className="header">
          <h1>Magic Session: {sessionId}</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>

        <h2>Speak to the Spectator</h2>

        <div className="recording-controls">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`control-button ${isListening ? 'stop-button' : 'start-button'}`}
          >
            {isListening ? '⏹️ Stop Speaking' : '🎤 Start Speaking'}
          </button>
        </div>

        {isListening && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">
              {transcript || "Waiting for speech..."}
            </div>
          </div>
        )}

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

        <h1>The Magician Says:</h1>
        <div className="transcript-box">
          {transcript ? (
            <h2>"{transcript}"</h2>
          ) : (
            <p>Waiting for the magician to speak...</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;