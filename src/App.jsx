import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import LoginPage from './Login';
import axios from 'axios';
import { useSpeechToText } from './hooks/useSpeechToText';

// --- WebSocket Hook ---
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        const wsUrl = "wss://magix-trix.onrender.com"
        // const wsUrl = "ws://localhost:3001";

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          setConnectionStatus('connected');
          if (reconnectInterval.current) {
            clearInterval(reconnectInterval.current);
            reconnectInterval.current = null;
          }
          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'joined') console.log("Joined:", data.sessionId);

            if (data.type === 'summarize_complete' && role === 'magician') {
              if (data.topic?.length > 0 && navigator.vibrate) {
                navigator.vibrate([1000, 200, 1000, 200, 1000]);
              }
            }

            if (data.type === 'summary' && role === 'spectator') {
              if (data.topic?.length > 0) {
                window.location.href = `https://www.google.com/search?q=${data.topic || data.summary}`;
              }
            }
          } catch (error) {
            console.error("WS parse error:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          setConnectionStatus('disconnected');
          if (!reconnectInterval.current) reconnectInterval.current = setInterval(connect, 3000);
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('error');
        };
      };

      connect();

      return () => {
        clearInterval(reconnectInterval.current);
        if (ws.current && ws.current.readyState !== WebSocket.CLOSED) ws.current.close();
      };
    }
  }, [sessionId, role]);

  return { ws, connectionStatus };
};

// --- App ---
function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fullSpeech, setFullSpeech] = useState('');
  const [isMagicActive, setIsMagicActive] = useState(false);
  const [magicSpeech, setMagicSpeech] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [startKeyword, setStartKeyword] = useState("start magic");
  const [endKeyword, setEndKeyword] = useState("stop magic");
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  const isProcessingRef = useRef(false);
  const magicActiveRef = useRef(false);
  const audioChunksRef = useRef([]);

  const { ws, connectionStatus } = useWebSocket(sessionId, role);

  const BASE_URL = 'https://magix-trix.onrender.com/api'
  // const BASE_URL = 'http://localhost:3001/api';

  // --- Native Speech Hook ---
  const {
    transcript: speechTranscript,
    listening,
    supported: browserSupportsSpeechRecognition,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText("en-US");

  // Parse URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const sessionParam = params.get('session');
    if (roleParam && sessionParam) {
      setRole(roleParam);
      setSessionId(sessionParam);
    }
  }, []);

  // --- Keyword detection ---
  useEffect(() => {
    if (role !== 'magician' || !speechTranscript || isProcessingRef.current) return;

    const lowerText = speechTranscript.toLowerCase();
    const containsStart = lowerText.includes(startKeyword.toLowerCase());
    const containsEnd = lowerText.includes(endKeyword.toLowerCase());

    // If both keywords detected while magic is active, stop the session
    if (containsStart && containsEnd && magicActiveRef.current) {
      finalizeMagicSession();
      return;
    }

    // Start magic if keyword detected and not already active
    if (containsStart && !magicActiveRef.current) {
      handleStartMagic();
    } 
    // Stop magic if keyword detected and currently active
    else if (containsEnd && magicActiveRef.current) {
      finalizeMagicSession();
    } 
    // Capture speech during magic session
    else if (magicActiveRef.current) {
      handleMagicSpeech(speechTranscript);
    }
  }, [speechTranscript, role, startKeyword, endKeyword]);

  // --- Handlers ---
  const handleStartMagic = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    magicActiveRef.current = true;
    setIsMagicActive(true);
    setMagicSpeech('');
    setFullSpeech('');
    audioChunksRef.current = [];
    setAudioChunks([]);
    
    console.log("🎬 Magic Recording started!");
    await startAudioRecording();
    
    isProcessingRef.current = false;
  };

  const finalizeMagicSession = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    console.log("🛑 Magic Recording stopped!");
    
    magicActiveRef.current = false;
    setIsMagicActive(false);

    // Stop audio recording
    await stopAudioRecording();

    // Reset transcript for next session but KEEP listening
    resetTranscript();

    // Send summary via WebSocket
    if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "summarize",
        text: fullSpeech,
        timestamp: Date.now(),
      }));
    }

    isProcessingRef.current = false;
  };

  const handleMagicSpeech = (text) => {
    let cleanText = text
      .replace(new RegExp(startKeyword, 'gi'), '')
      .replace(new RegExp(endKeyword, 'gi'), '')
      .trim();

    if (cleanText) {
      const updatedSpeech = magicSpeech ? magicSpeech + ' ' + cleanText : cleanText;
      setMagicSpeech(updatedSpeech);
      setFullSpeech(updatedSpeech);
      setTranscript(cleanText);

      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ 
          type: "transcript", 
          word: cleanText, 
          timestamp: Date.now() 
        }));
      }
    }
  };

  // --- Audio Recording ---
  const startAudioRecording = async () => {
    try {
      // Stop any existing recording first
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          sampleRate: 16000, 
          channelCount: 1 
        } 
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => { 
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log("📦 Audio chunks collected:", audioChunksRef.current.length);
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log("📤 Sending audio blob:", audioBlob.size, "bytes");
          await sendAudioToBackendREST(audioBlob);
        }
        
        // Cleanup stream
        stream.getTracks().forEach(track => track.stop());
        audioChunksRef.current = [];
      };

      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);
      console.log("🎙️ MediaRecorder started");
      
    } catch (error) { 
      console.error('❌ Audio recording init error:', error); 
    }
  };

  const stopAudioRecording = () => {
    return new Promise((resolve) => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.onstop = async (event) => {
          console.log("📦 Audio chunks collected:", audioChunksRef.current.length);
          
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            console.log("📤 Sending audio blob:", audioBlob.size, "bytes");
            await sendAudioToBackendREST(audioBlob);
          }
          
          // Cleanup
          if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
          }
          audioChunksRef.current = [];
          setMediaRecorder(null);
          resolve();
        };
        
        mediaRecorder.stop();
      } else {
        resolve();
      }
    });
  };

  const sendAudioToBackendREST = async (audioBlob) => {
    console.log("📡 Sending audio to backend for processing...");

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      
      const response = await axios.post(`${BASE_URL}/upload-audio`, formData, { 
        headers: { 'Content-Type': 'multipart/form-data' }, 
        timeout: 300000 
      });
      
      console.log("✅ Audio uploaded successfully:", response.data);
    } catch (err) { 
      console.error('❌ Audio upload error:', err); 
    }
  };

  // --- Auto-start mic when both users join ---
  useEffect(() => {
    if (!ws.current || role !== 'magician') return;
    
    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready" && !listening) {
          console.log("👥 Both users joined - Auto-starting microphone");
          startListening();
        }
      } catch (err) { 
        console.error(err); 
      }
    };
    
    ws.current.addEventListener("message", handleReady);
    return () => {
      if (ws.current) {
        ws.current.removeEventListener("message", handleReady);
      }
    };
  }, [role, ws, listening, startListening]);

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    
    // Cleanup before logout
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    stopListening();
    
    window.sessionStorage.clear();
    window.location.reload();
  };

  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // --- Manual Start/Stop Handler ---
  const handleManualMicToggle = async () => {
    if (listening) {
      // If magic is active, finalize the session (stops recording + mic)
      if (isMagicActive) {
        await finalizeMagicSession();
      }
      // Stop mic
      stopListening();
    } else {
      // Start mic
      startListening();
    }
  };

  // --- Render ---
  if (!role) return <LoginPage />;
  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="container center">
        <h1>❌ Browser does not support speech recognition</h1>
        <p>Please use Chrome, Edge, or Safari</p>
      </div>
    );
  }

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
    if (!storedUser) {
      return <LoginPage />;
    }

    return (
      <div className="container magician-view">
        <div className="header">
          <button className='logoutBtn' onClick={handleLogout}>Logout</button>
          <h1>🎩 Magic Session</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>

        <div className='keyword_container'>
          <div>
            <label>Start Keyword:</label>
            <input 
              type="text" 
              value={startKeyword} 
              onChange={e => setStartKeyword(e.target.value)} 
              disabled={listening} 
            />
          </div>
          <div>
            <label>End Keyword:</label>
            <input 
              type="text" 
              value={endKeyword} 
              onChange={e => setEndKeyword(e.target.value)} 
              disabled={listening} 
            />
          </div>
        </div>

        <div className="recording-controls">
          <button
            onClick={handleManualMicToggle}
            className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
          >
            🎤 {listening ? 'Stop Microphone' : 'Start Microphone'}
          </button>
        </div>

        {listening && (
          <div className="status-indicator">
            {isMagicActive ? (
              <span style={{ fontWeight: 'bold', color: 'red', fontSize: '18px' }}>
                🔴 MAGIC ACTIVE - Recording in Progress
              </span>
            ) : (
              <span style={{ color: 'blue', fontSize: '16px' }}>
                👂 Listening for keywords: "{startKeyword}"
              </span>
            )}
          </div>
        )}

        {listening && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">
              {transcript || "Waiting for speech..."}
            </div>
            {isMagicActive && (
              <div className="audio-recording-indicator">
                🎙️ Audio Recording Active - Say "{endKeyword}" to stop
              </div>
            )}
            {isMagicActive && magicSpeech && (
              <div className="magic-speech-display">
                <h4>Magic Speech Captured:</h4>
                <p>{magicSpeech}</p>
              </div>
            )}
          </div>
        )}

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <div className="link-container">
            <input type="text" value={getSpectatorLink()} readOnly />
            <button 
              onClick={() => { 
                navigator.clipboard.writeText(getSpectatorLink()); 
                setIsCopied(true); 
                setTimeout(() => setIsCopied(false), 2000); 
              }} 
              className="copy-button"
            >
              {isCopied ? '✅ Copied' : "📋 Copy"}
            </button>
          </div>
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`} 
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
          <h1>🎭 Magic Session</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>

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