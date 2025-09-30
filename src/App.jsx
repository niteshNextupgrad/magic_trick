import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import LoginPage from './Login';
import axios from 'axios';
import { useSpeechToText } from './hooks/useSpeechToText';

// --- WebSocket Hook (unchanged) ---
const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        const wsUrl = "wss://magix-trix.onrender.com";
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
  const [audioStream, setAudioStream] = useState(null);
  const [micError, setMicError] = useState('');

  const isProcessingRef = useRef(false);
  const magicActiveRef = useRef(false);
  const speechBufferRef = useRef('');

  const { ws, connectionStatus } = useWebSocket(sessionId, role);
  const BASE_URL = 'https://magix-trix.onrender.com/api';

  // --- Speech Recognition Hook ---
  const {
    transcript: speechTranscript,
    listening,
    supported: browserSupportsSpeechRecognition,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText("en-US");

  // --- Parse URL ---
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

    speechBufferRef.current = speechTranscript;

    if (containsStart && containsEnd) {
      if (magicActiveRef.current) finalizeMagicSession();
      return;
    }

    if (containsStart && !magicActiveRef.current) handleStartMagic();
    else if (containsEnd && magicActiveRef.current) finalizeMagicSession();
    else if (magicActiveRef.current) handleMagicSpeech(speechBufferRef.current);
  }, [speechTranscript, role, startKeyword, endKeyword]);

  // --- Handlers with proper mic management ---
  const handleStartMagic = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setMicError('');

    console.log("🔄 Starting magic session...");

    try {
      // 1. First stop speech recognition completely
      stopListening();
      
      // 2. Wait longer for mobile browsers (500ms minimum)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 3. Start audio recording
      await startAudioRecording();
      
      // 4. Update state only after successful recording start
      magicActiveRef.current = true;
      setIsMagicActive(true);
      setMagicSpeech('');
      setFullSpeech('');
      resetTranscript();
      
      console.log("✅ Magic Recording started successfully!");
      
    } catch (error) {
      console.error("❌ Failed to start magic session:", error);
      setMicError('Failed to start recording. Please check microphone permissions.');
      // Restart speech recognition if magic session fails
      startListening();
    } finally {
      isProcessingRef.current = false;
    }
  };

  const finalizeMagicSession = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    console.log("🔄 Stopping magic session...");

    try {
      magicActiveRef.current = false;
      setIsMagicActive(false);

      // 1. Stop audio recording first
      stopAudioRecording();
      
      // 2. Wait for recording to fully stop
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 3. Send final speech data
      if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: "summarize",
          text: fullSpeech,
          timestamp: Date.now(),
        }));
      }

      console.log("✅ Magic Recording stopped successfully!");
      
    } catch (error) {
      console.error("❌ Error stopping magic session:", error);
    } finally {
      // 4. Always restart speech recognition
      startListening();
      isProcessingRef.current = false;
    }
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
        ws.current.send(JSON.stringify({ type: "transcript", word: cleanText, timestamp: Date.now() }));
      }
    }
  };

  // --- Improved Audio Recording with better error handling ---
  const initAudioRecording = async () => {
    try {
      // Clean up any existing streams first
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        setAudioStream(null);
      }

      console.log("🎙️ Requesting microphone access...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          sampleRate: 16000, 
          channelCount: 1,
          autoGainControl: true
        }
      });
      
      console.log("✅ Microphone access granted");

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];

      recorder.ondataavailable = (event) => { 
        if (event.data.size > 0) chunks.push(event.data); 
      };
      
      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          if (audioBlob.size > 0) {
            await sendAudioToBackendREST(audioBlob);
          }
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          // Always clean up stream
          stream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
          });
        }
      };

      // Handle recorder errors
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setMicError('Audio recording error occurred');
      };

      setMediaRecorder(recorder);
      setAudioStream(stream);
      return recorder;
      
    } catch (error) { 
      console.error('❌ Microphone access failed:', error);
      setMicError('Microphone access denied. Please check permissions and try again.');
      throw error; // Re-throw to handle in calling function
    }
  };

  const startAudioRecording = async () => {
    if (mediaRecorder?.state === 'recording') {
      console.log("⚠️ Audio recording already in progress");
      return;
    }
    
    try {
      const recorder = mediaRecorder || await initAudioRecording();
      if (recorder && recorder.state === 'inactive') {
        recorder.start(1000);
        console.log("🔴 Audio recording started");
      }
    } catch (error) {
      console.error("❌ Failed to start audio recording:", error);
      throw error;
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder?.state === 'recording') {
      console.log("🛑 Stopping audio recording...");
      mediaRecorder.stop();
    }
    
    // Clean up resources
    if (audioStream) {
      audioStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setAudioStream(null);
    }
    setMediaRecorder(null);
  };

  const sendAudioToBackendREST = async (audioBlob) => {
    console.log("📤 Sending audio to backend for processing");
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      await axios.post(`${BASE_URL}/upload-audio`, formData, { 
        headers: { 'Content-Type': 'multipart/form-data' }, 
        timeout: 300000 
      });
      console.log("✅ Audio sent successfully");
    } catch (err) { 
      console.error('❌ Audio upload error:', err); 
    }
  };

  // --- Auto-mic on both joined ---
  useEffect(() => {
    if (!ws.current || role !== 'magician') return;
    
    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready" && !listening && !isMagicActive) {
          console.log("🎯 Starting speech recognition (ready signal)");
          startListening();
        }
      } catch (err) { 
        console.error("WebSocket message error:", err); 
      }
    };
    
    ws.current.addEventListener("message", handleReady);
    return () => {
      if (ws.current) {
        ws.current.removeEventListener("message", handleReady);
      }
    };
  }, [role, ws, listening, isMagicActive, startListening]);

  // --- Logout ---
  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    
    // Clean up resources
    stopAudioRecording();
    stopListening();
    
    window.sessionStorage.clear();
    window.location.reload();
  };

  // --- Spectator Link ---
  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // --- Before unload cleanup ---
  useEffect(() => {
    const handleUnload = () => {
      stopAudioRecording();
      stopListening();
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // --- Render ---
  if (!role) return <LoginPage />;
  if (!browserSupportsSpeechRecognition) return <div className="container center"><h1>Browser does not support speech recognition</h1></div>;

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
    if (!storedUser) return <LoginPage />;

    return (
      <div className="container magician-view">
        <div className="header">
          <button className='logoutBtn' onClick={handleLogout}>Logout</button>
          <h1>Magic Session</h1>
          <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
        </div>

        {micError && (
          <div className="error-message" style={{color: 'red', margin: '10px 0', padding: '10px', border: '1px solid red', borderRadius: '5px'}}>
            ⚠️ {micError}
          </div>
        )}

        <div className='keyword_container'>
          <div>
            <label>Start Keyword:</label>
            <input type="text" value={startKeyword} onChange={e => setStartKeyword(e.target.value)} disabled={listening || isMagicActive} />
          </div>
          <div>
            <label>End Keyword:</label>
            <input type="text" value={endKeyword} onChange={e => setEndKeyword(e.target.value)} disabled={listening || isMagicActive} />
          </div>
        </div>

        <div className="recording-controls">
          <button
            onClick={async () => {
              if (isMagicActive) {
                await finalizeMagicSession();
              } else {
                stopListening();
              }
            }}
            className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
            disabled={isProcessingRef.current}
          >
            🎤 {listening ? 'Stop Listening' : 'Start Listening'}
            {isProcessingRef.current && ' (Processing...)'}
          </button>
        </div>

        {listening && (
          <div className="listening-status">
            {isMagicActive ? (
              <span style={{ fontWeight: 'bold', color: 'green' }}>🔴 Magic Active - Recording</span>
            ) : (
              <span style={{ color: 'blue' }}>👂 Listening for keywords...</span>
            )}
            <h3>You're saying:</h3>
            <div className="current-transcript">{transcript || "Waiting for speech..."}</div>
            {isMagicActive && (
              <div className="audio-recording-indicator">
                🔴 Audio Recording Active - Say "{endKeyword}" to stop
              </div>
            )}
          </div>
        )}

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <div className="link-container">
            <input type="text" value={getSpectatorLink()} readOnly />
            <button onClick={() => { 
              navigator.clipboard.writeText(getSpectatorLink()); 
              setIsCopied(true); 
              setTimeout(() => setIsCopied(false), 2000); 
            }} className="copy-button">
              {isCopied ? '📋 Copied!' : "Copy Link"}
            </button>
          </div>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`} alt="Spectator QR Code" />
        </div>

        {/* Debug info */}
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#666', background: '#f5f5f5', padding: '10px', borderRadius: '5px' }}>
          <p><strong>Debug Info:</strong></p>
          <p>Listening: {listening ? '✅ Yes' : '❌ No'}</p>
          <p>Magic Active: {isMagicActive ? '✅ Yes' : '❌ No'}</p>
          <p>Processing: {isProcessingRef.current ? '✅ Yes' : '❌ No'}</p>
          <p>Audio Stream: {audioStream ? '✅ Active' : '❌ Inactive'}</p>
        </div>
      </div>
    );
  }

  if (role === 'spectator') {
    return (
      <div className="container center spectator-view">
        <div className="header">
          <h1>Magic Session</h1>
          <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
        </div>

        <div className="transcript-box">
          {transcript ? <h2>"{transcript}"</h2> : <p>Waiting for the magician to speak...</p>}
        </div>
      </div>
    );
  }

  return null;
}

export default App;