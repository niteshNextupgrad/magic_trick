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

            // Spectator receives magician's speech transcript
            if (data.type === 'transcript' && role === 'spectator') {
              console.log("Transcript received from magician:", data.word);
              setTranscript(data.word);
              // if (navigator.vibrate) navigator.vibrate(200);
            }

            if (data.type === 'joined') {
              console.log("Successfully joined session:", data.sessionId);
            }

            // Magician receives completion confirmation - can trigger vibration
            if (data.type === 'summarize_complete' && role === 'magician') {
              console.log("AI processing complete, topics:", data.topics);

              // Vibrate magician's device when processing is complete
              if (data.topics && data.topics.length > 0 && navigator.vibrate) {
                navigator.vibrate([1000, 500, 1000]);
              } else if (navigator.vibrate) {
                navigator.vibrate([200, 200, 200]);
              }
            }

            // Handle summary response - spectator gets redirected to Google search
            if (data.type === 'summary' && role === 'spectator') {
              console.log("Summary Data received:", data);
              // Vibrate to indicate processing complete
              // navigator.vibrate([1000, 1000, 2000]);

              if (data.topics && data.topics.length > 0) {
                // Redirect spectator to Google search with the identified topic
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

  return { ws, transcript, connectionStatus };
};

function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fullSpeech, setFullSpeech] = useState(''); // Store all speech for summarization
  const [lastTranscript, setLastTranscript] = useState(''); // Track the last transcript to avoid duplicates
  const silenceTimerRef = useRef(null);

  const {
    transcript: speechTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  const { ws, transcript: receivedTranscript, connectionStatus } = useWebSocket(sessionId, role);

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

  // Auto-stop after 5 seconds of silence (magician only)
  useEffect(() => {
    if (role === 'magician' && listening) {
      // Clear any existing timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Set new timer to stop after 5 seconds of no speech
      silenceTimerRef.current = setTimeout(() => {
        if (listening) {
          console.log('⏰ No speech detected for 5 seconds, stopping...');
          stopListening();
        }
      }, 5000); // 5 seconds
    }

    // Cleanup on unmount
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [listening, speechTranscript, role]); // Reset timer when speech is detected

  // Send magician's transcript to spectator when speech is detected
  useEffect(() => {
    if (role === 'magician' && listening && !manuallyStopped) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      const lastSpeech = speechTranscript;
      silenceTimerRef.current = setTimeout(() => {
        if (listening && speechTranscript === lastSpeech && !manuallyStopped) {
          console.log("⏰ Auto-stop after 5s silence");
          stopListening();
        }
      }, 5000);
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [speechTranscript, listening, role, manuallyStopped]);


  // Update transcript state with received transcript (for spectator)
  useEffect(() => {
    if (role === 'spectator' && receivedTranscript) {
      setTranscript(receivedTranscript);
    }
  }, [receivedTranscript, role]);

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

  // Start listening (magician only)
  const startListening = async () => {
    try {
      console.log('🎤 Start listening...');
      setManuallyStopped(false); // reset stop flag
      SpeechRecognition.startListening({ continuous: true });
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please allow microphone permissions to use speech recognition');
    }
  };


  // Stop listening (magician only)
  const stopListening = () => {
    console.log("⏹️ Stop listening manually...");
    setManuallyStopped(true); // user clicked stop
    SpeechRecognition.stopListening();
    resetTranscript();

    if (role === 'magician' && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'summarize',
        text: fullSpeech || speechTranscript,
        timestamp: Date.now()
      });
      ws.current.send(message);
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };


  // Track full speech for magician
  useEffect(() => {
    if (role === 'magician' && speechTranscript && speechTranscript !== lastTranscript) {
      // Only add new words, not the entire transcript each time
      const newWords = speechTranscript.replace(lastTranscript, '').trim();
      if (newWords) {
        setFullSpeech(prev => prev ? prev + ' ' + newWords : newWords);
        setLastTranscript(speechTranscript);
        console.log('Added to full speech:', newWords);
      }
    }
  }, [speechTranscript, lastTranscript, role]);

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
    if (!browserSupportsSpeechRecognition) {
      return (
        <div className="container center">
          <h1>Browser Not Supported</h1>
          <p>Please use Chrome, Edge, or Safari for speech recognition.</p>
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
            onClick={listening ? stopListening : startListening}
            className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
          >
            {listening ? '⏹️ Stop Speaking' : '🎤 Start Speaking'}
          </button>
        </div>

        {listening && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">
              {speechTranscript || "Waiting for speech..."}
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

        <div className="instructions">
          <p>Listen to what the magician says. The magic will happen automatically!</p>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
