import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import LoginPage from './Login';
import axios from 'axios';
import { useSpeechToText } from './hooks/useSpeechToText';

// --- Detect Mobile ---
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// --- WebSocket Hook ---
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

          if (data.type === 'joined') console.log("Joined:", data.sessionId);

          if (role === 'magician') {
            if (data.type === 'keyword_detected') {
              if (data.keyword === 'start' && callbacks.onStartKeyword) callbacks.onStartKeyword();
              if (data.keyword === 'end' && callbacks.onEndKeyword) callbacks.onEndKeyword();
            }
            if (data.type === 'transcript' && callbacks.onTranscript) callbacks.onTranscript(data.text);
            if (data.type === 'summarize_complete' && data.topic?.length > 0 && navigator.vibrate) {
              navigator.vibrate([1000, 200, 1000, 200, 1000]);
            }
          }

          if (role === 'spectator' && data.type === 'summary' && data.topic?.length > 0) {
            window.location.href = `https://www.google.com/search?q=${data.topic || data.summary}`;
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
  const [isMobile, setIsMobile] = useState(false);
  const [isListeningForKeywords, setIsListeningForKeywords] = useState(false);

  const isProcessingRef = useRef(false);
  const magicActiveRef = useRef(false);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const chunkCounterRef = useRef(0);

  const BASE_URL = 'https://magix-trix.onrender.com/api';
  // const BASE_URL = 'http://localhost:3001/api';

  // --- WebSocket callbacks ---
  const wsCallbacks = {
    onStartKeyword: () => {
      console.log("🎬 Start keyword detected by backend!");
      if (!magicActiveRef.current) handleStartMagic();
    },
    onEndKeyword: () => {
      console.log("🛑 End keyword detected by backend!");
      if (magicActiveRef.current) finalizeMagicSession();
    },
    onTranscript: (text) => {
      setTranscript(text);
      if (magicActiveRef.current) {
        setMagicSpeech(prev => prev ? prev + ' ' + text : text);
        setFullSpeech(prev => prev ? prev + ' ' + text : text);
      }
    }
  };

  const { ws, connectionStatus } = useWebSocket(sessionId, role, wsCallbacks);

  // --- Native Speech Hook (Desktop Only) ---
  const {
    transcript: speechTranscript,
    listening,
    supported: browserSupportsSpeechRecognition,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText("en-US");

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

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
  // --- Auto-start microphone on join ---
  useEffect(() => {
    if (!ws.current || !role) return;

    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready") {
          console.log("Both users joined - Auto-starting microphone");

          if (role === 'magician') {
            if (isMobile) startMobileKeywordListening();
            else startListening();
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    ws.current.addEventListener("message", handleReady);
    return () => {
      if (ws.current) ws.current.removeEventListener("message", handleReady);
    };
  }, [role, ws, isMobile, startListening]);

  // --- Desktop Keyword Detection ---
  useEffect(() => {
    if (!speechTranscript || !role || isMobile || role !== 'magician' || isProcessingRef.current) return;

    const lowerText = speechTranscript.toLowerCase();
    const containsStart = lowerText.includes(startKeyword.toLowerCase());
    const containsEnd = lowerText.includes(endKeyword.toLowerCase());

    if (containsStart && containsEnd && magicActiveRef.current) finalizeMagicSession();
    else if (containsStart && !magicActiveRef.current) handleStartMagic();
    else if (containsEnd && magicActiveRef.current) finalizeMagicSession();
    else if (magicActiveRef.current) handleMagicSpeech(speechTranscript);
  }, [speechTranscript, role, startKeyword, endKeyword, isMobile]);

  // --- Handlers ---
  const handleStartMagic = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    magicActiveRef.current = true;
    setIsMagicActive(true);
    setMagicSpeech('');
    setFullSpeech('');
    audioChunksRef.current = [];

    if (!isMobile) await startAudioRecording();
    isProcessingRef.current = false;
  };

  const finalizeMagicSession = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    magicActiveRef.current = false;
    setIsMagicActive(false);

    if (isMobile && audioChunksRef.current.length > 0) {
      const fullAudioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder?.mimeType || 'audio/webm' });
      await sendAudioToBackend(fullAudioBlob);
      if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      audioChunksRef.current = [];
      setMediaRecorder(null);
      setIsListeningForKeywords(false);
      chunkCounterRef.current = 0;
    } else {
      await stopAudioRecording();
      resetTranscript();
    }

    if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "summarize", text: fullSpeech, timestamp: Date.now() }));
    }

    isProcessingRef.current = false;
  };

  const handleMagicSpeech = (text) => {
    console.log("Magic record started!");
    
    let cleanText = text.replace(new RegExp(startKeyword, 'gi'), '').replace(new RegExp(endKeyword, 'gi'), '').trim();
    if (!cleanText) return;

    const updatedSpeech = magicSpeech ? magicSpeech + ' ' + cleanText : cleanText;
    setMagicSpeech(updatedSpeech);
    setFullSpeech(updatedSpeech);
    setTranscript(cleanText);

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "transcript", word: cleanText, timestamp: Date.now() }));
    }
  };

  // --- Audio Recording (Desktop) ---
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 } });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          await sendAudioToBackend(audioBlob);
        }
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        audioChunksRef.current = [];
      };

      recorder.start(1000);
      setMediaRecorder(recorder);
    } catch (err) {
      console.error(err);
      alert('Microphone error: ' + err.message);
    }
  };

  const stopAudioRecording = () => new Promise(resolve => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
          await sendAudioToBackend(audioBlob);
        }
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        audioChunksRef.current = [];
        setMediaRecorder(null);
        resolve();
      };
      mediaRecorder.stop();
    } else resolve();
  });

  // --- Mobile Recording ---
  const startMobileKeywordListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 } });
      streamRef.current = stream;
      setIsListeningForKeywords(true);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      chunkCounterRef.current = 0;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          chunkCounterRef.current++;
          audioChunksRef.current.push(event.data);
          await sendAudioChunkForKeywordDetection(event.data, chunkCounterRef.current);
        }
      };

      recorder.onstop = () => console.log("🛑 Mobile recording stopped");
      recorder.start(3000);
      setMediaRecorder(recorder);

    } catch (err) { console.error(err); alert('Microphone error: ' + err.message); }
  };

  const stopMobileKeywordListening = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsListeningForKeywords(false);
    chunkCounterRef.current = 0;
  };

  const sendAudioChunkForKeywordDetection = async (audioChunk, chunkNumber) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioChunk, `chunk_${chunkNumber}_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      formData.append('startKeyword', startKeyword);
      formData.append('endKeyword', endKeyword);
      formData.append('isMagicActive', String(magicActiveRef.current));
      formData.append('chunkNumber', chunkNumber);
      axios.post(`${BASE_URL}/process-audio-chunk`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 10000 })
        .then(res => console.log(`✅ Chunk ${chunkNumber} processed`))
        .catch(err => console.error(err));
    } catch (err) { console.error(err); }
  };

  const sendAudioToBackend = async (audioBlob) => {
    console.log("Sending audio blob to backend..");
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      await axios.post(`${BASE_URL}/upload-audio`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
      console.log("Audio uploaded");
    } catch (err) { console.error(err); }
  };

  // --- Logout ---
  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    if (!isMobile) stopListening();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    window.sessionStorage.clear();
    window.location.reload();
  };

  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // --- Mobile Toggle ---
  const handleMobileListeningToggle = async () => {
    if (isListeningForKeywords) stopMobileKeywordListening();
    else await startMobileKeywordListening();
  };

  // --- Desktop Mic Toggle ---
  const handleDesktopMicToggle = async () => {
    if (listening) {
      if (isMagicActive) await finalizeMagicSession();
      stopListening();
    } else startListening();
  };

  // --- Render ---
  if (!role) return <LoginPage />;
  if (!isMobile && !browserSupportsSpeechRecognition) return <div className="container center"><h1>❌ Browser does not support speech recognition</h1></div>;

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

        <div className='keyword_container'>
          <div>
            <label>Start Keyword:</label>
            <input type="text" value={startKeyword} onChange={e => setStartKeyword(e.target.value)} disabled={isMobile ? isListeningForKeywords : listening} />
          </div>
          <div>
            <label>End Keyword:</label>
            <input type="text" value={endKeyword} onChange={e => setEndKeyword(e.target.value)} disabled={isMobile ? isListeningForKeywords : listening} />
          </div>
        </div>

        <div className="recording-controls">
          {isMobile ? (
            <button onClick={handleMobileListeningToggle} className={`control-button ${isListeningForKeywords ? 'stop-button' : 'start-button'}`} style={{ fontSize: '18px', padding: '20px 40px' }}>
              {isListeningForKeywords ? '⏹️ Stop Listening' : '🎤 Start Listening for Keywords'}
            </button>
          ) : (
            <button onClick={handleDesktopMicToggle} className={`control-button ${listening ? 'stop-button' : 'start-button'}`}>
              🎤 {listening ? 'Stop Microphone' : 'Start Microphone'}
            </button>
          )}
        </div>

        {((isMobile && isListeningForKeywords) || (!isMobile && listening)) && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">{transcript || "Waiting for speech..."}</div>
            {isMagicActive ? <div className="magic-speech-display"><h4>Magic Speech Active:</h4><p>{magicSpeech}</p></div> : <p>Waiting for keyword </p>}
          </div>
        )}

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <div className="link-container">
            <input type="text" value={getSpectatorLink()} readOnly />
            <button onClick={() => { navigator.clipboard.writeText(getSpectatorLink()); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} className="copy-button">{isCopied ? 'Copied' : "Copy"}</button>
          </div>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`} alt="Spectator QR Code" />
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
      </div>
    );
  }

  return null;
}

export default App;



