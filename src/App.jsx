import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import LoginPage from './Login';
import axios from 'axios';
import RecordRTC from 'recordrtc';
import SelectLanguage from './SelectLanguage';
import { Clipboard, LogOut, Mic, Settings, SquareStop, X } from 'lucide-react';

// WebSocket Hook 
const useWebSocket = (sessionId, role, callbacks = {}) => {
  const ws = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (!sessionId || !role) return;

    const connect = () => {
      // const wsUrl = "ws://localhost:3001";
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

          if (data.type === 'keyword_detected' && role === 'magician') {
            if (data.keyword === 'start' && callbacks.onStartKeyword) callbacks.onStartKeyword();
            if (data.keyword === 'end' && callbacks.onEndKeyword) callbacks.onEndKeyword();
          }

          if (data.type === 'transcript' && callbacks.onTranscript) callbacks.onTranscript(data.text);

          if (data.type === 'magic_transcript' && callbacks.onMagicTranscript) {
            callbacks.onMagicTranscript(data.text);
          }

          if (data.type === 'summarize_complete' && role === 'magician') {
            console.log("Summary:", data?.summary);
            console.log("Topic:", data?.topic);
            if (callbacks.onSummarizeComplete) callbacks.onSummarizeComplete(data);
            if (data.topic?.length > 0 && navigator.vibrate) {
              navigator.vibrate([1000, 200, 1000, 200, 1000]);
            }
          }

          if (data.type === 'diarization_error' && role === 'magician') {
            console.error("Diarization error:", data.error);
            if (callbacks.onDiarizationError) callbacks.onDiarizationError(data);
          }
          if (data.type === 'no_recording_error' && role === 'magician') {
            if (callbacks.onRecordingError) callbacks.onRecordingError(data);
          }

          if (data.type === 'summary' && role === 'spectator') {
            if (data.topic?.length > 0) {
              window.location.href = `https://www.google.com/search?q=${data.topic}`;
            }
          }
        } catch (error) {
          console.error("WS parse error:", error);
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
  }, [sessionId, role]);

  return { ws, connectionStatus };
};

function App() {
  const [role, setRole] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isMagicActive, setIsMagicActive] = useState(false);
  const [magicSpeech, setMagicSpeech] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [startKeyword, setStartKeyword] = useState("start");
  const [endKeyword, setEndKeyword] = useState("stop");
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [statusMessage, setStatusMessage] = useState('Waiting for spectator to join');
  const [fullMagicTranscript, setFullMagicTranscript] = useState('');

  const [showSettings, setShowSettings] = useState(false);

  const magicActiveRef = useRef(false);
  const chunkCounterRef = useRef(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  // IMPORTANT: Store keywords in refs to always use latest values
  const startKeywordRef = useRef(startKeyword);
  const endKeywordRef = useRef(endKeyword);
  const selectedLanguageRef = useRef(selectedLanguage);

  // const BASE_URL = 'http://localhost:3001/api';
  const BASE_URL = 'https://magix-trix.onrender.com/api';

  // Update refs when keywords change
  useEffect(() => {
    startKeywordRef.current = startKeyword;
    // console.log("Start keyword updated to:", startKeyword);
  }, [startKeyword]);

  useEffect(() => {
    endKeywordRef.current = endKeyword;
  }, [endKeyword]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // WebSocket Callbacks
  const wsCallbacks = {
    onStartKeyword: () => {
      console.log("Start keyword detected!");
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
      if (!magicActiveRef.current) {
        magicActiveRef.current = true;
        setIsMagicActive(true);
        setMagicSpeech('');
        setStatusMessage('Magic started — recording in progress');
      }
    },
    onEndKeyword: () => {
      console.log("End keyword detected!");
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
      if (magicActiveRef.current) {
        magicActiveRef.current = false;
        setIsMagicActive(false);
        stopAudioCapture();
        setStatusMessage('Magic stopped — processing audio...');
      }
    },
    onTranscript: (text) => {
      if (!text || text.split(' ').length < 2) return;
      setTranscript(prev => prev ? prev + ' ' + text : text);
      if (magicActiveRef.current) {
        setMagicSpeech(prev => prev ? prev + ' ' + text : text);
      }
    },

    onMagicTranscript: (text) => {
      console.log("Full Magic Transcript Received:", text);
      setFullMagicTranscript(text);
    },
    onSummarizeComplete: (data) => {
      console.log("Summary:", data?.summary);
      console.log("Topic:", data?.topic);
      if (data.topic?.length > 0) {
        setStatusMessage(`Topic received: "${data.topic}"`);
      }

      setTranscript('');
    },
    onDiarizationError: (data) => {
      const errorMessages = {
        'no_speaker_detected': 'No speech detected in the recording. Please speak clearly and try again.',
        'processing_failed': 'Audio processing failed. Please check your connection and try again.',
        'deepgram_error': 'Transcription service error. Please try again.'
      };

      const message = errorMessages[data.error] || 'An error occurred. Please try again.';
      setStatusMessage(`Error: ${message}`);

      // Reset magic state if needed
      if (magicActiveRef.current) {
        magicActiveRef.current = false;
        setIsMagicActive(false);
      }
    },
    onRecordingError: (data) => {
      const errorMessages = {
        no_speaker_detected: 'No speech detected. Please speak clearly and try again.',
        processing_failed: 'Audio processing failed. Please check your connection and try again.',
        no_chunks_captured: 'No audio captured. Recording was too short or silent.',
        magic_not_started: 'Magic was never started. Please use the start button or keyword.'
      };

      const finalMessage = errorMessages[data.error] || data.message || 'An unknown error occurred.';
      setStatusMessage(`Error: ${finalMessage}`);

      // Reset magic state
      if (magicActiveRef.current) {
        magicActiveRef.current = false;
        setIsMagicActive(false);
      }
    }
  };

  const { ws, connectionStatus } = useWebSocket(sessionId, role, wsCallbacks);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const sessionParam = params.get('session');
    if (roleParam && sessionParam) {
      setRole(roleParam);
      setSessionId(sessionParam);
    }
  }, []);

  useEffect(() => {
    if (!ws.current) return;

    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready" && role === "magician" && !isListening) {
          console.log("Spectator Connected, Starting Audio mic");
          setStatusMessage('Spectator joined, ready to start');
          startAudioCapture();
        }
        if (data.type === "summarize_complete" && role === "magician") {
          stopAudioCapture();
        }
      } catch (err) {
        console.error("Error in ready handler:", err);
      }
    };

    ws.current.addEventListener("message", handleReady);
    return () => ws.current?.removeEventListener("message", handleReady);
  }, [role, ws, isListening]);

  // Start Audio Capture
  const startAudioCapture = async () => {
    try {
      console.log("Starting RecordRTC capture...");
      console.log("Current keywords - Start:", startKeywordRef.current, "End:", endKeywordRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      setIsListening(true);
      setFullMagicTranscript('');
      chunkCounterRef.current = 0;

      const recorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        timeSlice: 1500,
        ondataavailable: async (blob) => {
          chunkCounterRef.current++;
          await sendAudioChunk(blob);
        }
      });

      recorderRef.current = recorder;
      recorder.startRecording();
      console.log("RecordRTC started recording");
    } catch (err) {
      console.error("RecordRTC error:", err);
      alert(`Microphone access error: ${err.message}`);
    }
  };

  //  Stop Audio Capture
  const stopAudioCapture = () => {
    console.log("Stopping RecordRTC capture...");
    setIsListening(false);
    chunkCounterRef.current = 0;
    if (recorderRef.current) {
      recorderRef.current.stopRecording(() => {
        recorderRef.current = null;
      });
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Send Chunk - ALWAYS use refs for latest keyword values
  const sendAudioChunk = async (blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', blob, `chunk_${chunkCounterRef.current}_${Date.now()}.wav`);
      formData.append('sessionId', sessionId);
      formData.append('startKeyword', startKeywordRef.current);
      formData.append('endKeyword', endKeywordRef.current);
      formData.append('isMagicActive', magicActiveRef.current);
      formData.append('chunkNumber', chunkCounterRef.current);
      formData.append('language', selectedLanguageRef.current);

      await axios.post(`${BASE_URL}/process-audio-chunk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10000
      });
    } catch (err) {
      console.error('Chunk upload error:', err);
    }
  };

  // Toggle Listening (unchanged)
  const handleListeningToggle = async () => {
    if (isListening) {
      console.log("Manual stop triggered");
      if (magicActiveRef.current) {
        magicActiveRef.current = false;
        setIsMagicActive(false);
      }
      stopAudioCapture();
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'manual_end',
          sessionId,
          language: selectedLanguageRef.current
        }));
        setStatusMessage('Manual magic stopped — waiting for topic from server');
        setTranscript('');
      }
    } else {
      await startAudioCapture();
    }
  };

  const handleManualMagicStart = () => {
    if (!isListening) {
      alert("Please start Mic first!");
      return;
    }

    if (magicActiveRef.current) {
      alert("Magic is already active!");
      return;
    }

    console.log("Manual magic start triggered");
    console.log("Using keywords - Start:", startKeywordRef.current, "End:", endKeywordRef.current);

    magicActiveRef.current = true;
    setIsMagicActive(true);
    setMagicSpeech('');
    setStatusMessage('Manual magic started — recording in progress');

    // Send manual start to backend with keywords
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'manual_start',
        sessionId,
        startKeyword: startKeywordRef.current,
        endKeyword: endKeywordRef.current,
        language: selectedLanguageRef.current
      }));
    }
  };

  // Logout 
  const handleLogout = () => {
    if (!window.confirm("Are you sure, you want to logout?")) return;
    stopAudioCapture();
    window.sessionStorage.clear();
    window.location.reload();
  };

  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // Render UI
  if (!role) return <LoginPage />;

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
    if (!storedUser) return <LoginPage />;

    return (
      <div className="container magician-view">
        <div className="header">
          <h1>Inject Voice Recognition</h1>
          <div className="header-controls">
            <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
            <button className='logoutBtn' onClick={handleLogout} title='Logout'><LogOut color="white" size={20} /></button>
            <button
              className="settings-button"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings color="white" size={24} />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <div className="settings-header">
              <h3>Settings</h3>
              <button
                className="close-settings"
                onClick={() => setShowSettings(false)}
              >
                <X color='black' />
              </button>
            </div>

            <SelectLanguage value={selectedLanguage} onChange={setSelectedLanguage} isListening={isListening} />

            <div className='keyword_container'>
              <div> <label>Start Keyword:</label>
                <input type="text"
                  value={startKeyword}
                  onChange={e => setStartKeyword(e.target.value)}
                  disabled={isListening}
                  placeholder="e.g., start, begin, go" />
              </div>
              <div>
                <label>End Keyword:</label>
                <input type="text"
                  value={endKeyword}
                  onChange={e => setEndKeyword(e.target.value)}
                  disabled={isListening}
                  placeholder="e.g., stop, end, finish" />
              </div>
            </div>

            {isListening && (
              <div className="active-keywords-display">
                <strong>Active Keywords:</strong> Start: "{startKeyword}" | End: "{endKeyword}"
              </div>
            )}
          </div>
        )}

        <div className="session-status">
          <p><strong>Status:</strong> {statusMessage}</p>
        </div>

        {/* Main Content Area */}
        <div className="main-content">
          <div className="recording-controls">
            <button
              onClick={handleListeningToggle}
              className={`control-button ${isListening ? 'stop-button' : 'start-button'}`}
              style={{ fontSize: '18px', padding: '20px 40px', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              {isListening ? <><SquareStop />Stop Recording</> : <><Mic />Start Recording</>}
            </button>
          </div>

          {isListening && (
            <div className="status-indicator">
              {isMagicActive ? (
                <div className="magic-active">
                  <span className="magic-active-text">Magic Recording Active</span>
                  <p className="magic-hint">Say "{endKeyword}" to stop</p>
                </div>
              ) : (
                <div className="listening-mode">
                  <span className="listening-text">🔵 Listening for: "{startKeyword}"</span>
                  <button
                    onClick={handleManualMagicStart}
                    className="control-button start-button manual-start-btn"
                    disabled={!isListening || isMagicActive}
                  >
                    Start Manually
                  </button>
                </div>
              )}
            </div>
          )}

          {isListening && (
            <div className="listening-status">
              <h3>Live Transcript</h3>
              <div className="current-transcript">
                {transcript || "Waiting for speech..."}
              </div>
            </div>
          )}

          {!isListening && fullMagicTranscript && (
            <div className="magic-speech-display">
              <h3>Magic Transcript:</h3>
              <p>{fullMagicTranscript}</p>
            </div>
          )}

        </div>

        <div className="share-info">
          <p>Share this link with the spectator:</p>
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
              {isCopied ? 'Copied' : <><Clipboard size={16} /> Copy</>}
            </button>
          </div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`}
            alt="Spectator QR Code"
            style={{ marginTop: '15px' }}
          />
        </div>
      </div>
    );
  }

  if (role === 'spectator') {
    return (
      <div className="container center spectator-view">
        <div className="header">
          <h1>Inject Voice Recognition</h1>
          <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: '#666' }}>
            Waiting for the magician to perform magic...
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default App;