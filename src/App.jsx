// import React, { useState, useEffect, useRef } from 'react';
// import './App.css';
// import LoginPage from './Login';
// import axios from 'axios';
// import { useSpeechToText } from './hooks/useSpeechToText';

// // --- WebSocket Hook ---
// const useWebSocket = (sessionId, role) => {
//   const ws = useRef(null);
//   const [connectionStatus, setConnectionStatus] = useState('disconnected');
//   const reconnectInterval = useRef(null);

//   useEffect(() => {
//     if (sessionId && role) {
//       const connect = () => {
//         // const wsUrl = "ws://localhost:3001"
//         const wsUrl = "wss://magix-trix.onrender.com"

//         ws.current = new WebSocket(wsUrl);

//         ws.current.onopen = () => {
//           setConnectionStatus('connected');
//           if (reconnectInterval.current) {
//             clearInterval(reconnectInterval.current);
//             reconnectInterval.current = null;
//           }
//           ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
//         };

//         ws.current.onmessage = (event) => {
//           try {
//             const data = JSON.parse(event.data);

//             if (data.type === 'joined') console.log("Joined:", data.sessionId);

//             if (data.type === 'summarize_complete' && role === 'magician') {
//               if (data.topic?.length > 0 && navigator.vibrate) {
//                 navigator.vibrate([1000, 200, 1000, 200, 1000]);
//               }
//             }

//             if (data.type === 'summary' && role === 'spectator') {
//               if (data.topic?.length > 0) {
//                 window.location.href = `https://www.google.com/search?q=${data.topic || data.summary}`;
//               }
//             }
//           } catch (error) {
//             console.error("WS parse error:", error, event.data);
//           }
//         };

//         ws.current.onclose = () => {
//           setConnectionStatus('disconnected');
//           if (!reconnectInterval.current) reconnectInterval.current = setInterval(connect, 3000);
//         };

//         ws.current.onerror = (error) => {
//           console.error('WebSocket error:', error);
//           setConnectionStatus('error');
//         };
//       };

//       connect();

//       return () => {
//         clearInterval(reconnectInterval.current);
//         if (ws.current && ws.current.readyState !== WebSocket.CLOSED) ws.current.close();
//       };
//     }
//   }, [sessionId, role]);

//   return { ws, connectionStatus };
// };

// // --- App ---
// function App() {
//   const [role, setRole] = useState(null);
//   const [sessionId, setSessionId] = useState('');
//   const [transcript, setTranscript] = useState('');
//   const [fullSpeech, setFullSpeech] = useState('');
//   const [isMagicActive, setIsMagicActive] = useState(false);
//   const [magicSpeech, setMagicSpeech] = useState('');
//   const [isCopied, setIsCopied] = useState(false);
//   const [startKeyword, setStartKeyword] = useState("start magic");
//   const [endKeyword, setEndKeyword] = useState("stop magic");
//   const [mediaRecorder, setMediaRecorder] = useState(null);
//   const [audioStream, setAudioStream] = useState(null);

//   const isProcessingRef = useRef(false);
//   const magicActiveRef = useRef(false);

//   const { ws, connectionStatus } = useWebSocket(sessionId, role);

//   // const BASE_URL = "http://localhost:3001/api"
//   const BASE_URL = 'https://magix-trix.onrender.com/api'

//   // --- Native Speech Hook ---
//   const {
//     transcript: speechTranscript,
//     listening,
//     supported: browserSupportsSpeechRecognition,
//     startListening,
//     stopListening,
//     resetTranscript,
//   } = useSpeechToText("en-US");

//   // Parse URL
//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     const roleParam = params.get('role');
//     const sessionParam = params.get('session');
//     if (roleParam && sessionParam) {
//       setRole(roleParam);
//       setSessionId(sessionParam);
//     }
//   }, []);

//   // --- Keyword detection ---
//   useEffect(() => {
//     if (role !== 'magician' || !speechTranscript || isProcessingRef.current) return;

//     const lowerText = speechTranscript.toLowerCase();
//     const containsStart = lowerText.includes(startKeyword.toLowerCase());
//     const containsEnd = lowerText.includes(endKeyword.toLowerCase());

//     if (containsStart && containsEnd) {
//       if (magicActiveRef.current) finalizeMagicSession();
//       return;
//     }

//     if (containsStart && !magicActiveRef.current) handleStartMagic();
//     else if (containsEnd && magicActiveRef.current) finalizeMagicSession();
//     else if (magicActiveRef.current) handleMagicSpeech(speechTranscript);
//   }, [speechTranscript, role]);

//   // --- Handlers ---
//   const handleStartMagic = async () => {
//     if (isProcessingRef.current) return;
//     isProcessingRef.current = true;

//     magicActiveRef.current = true;
//     setIsMagicActive(true);
//     setMagicSpeech('');
//     setFullSpeech('');
//     console.log("magic Recording started!");
//     await startAudioRecording();
//     isProcessingRef.current = false;
//   };

//   const finalizeMagicSession = async () => {
//   if (isProcessingRef.current) return;
//   isProcessingRef.current = true;

//   magicActiveRef.current = false;
//   setIsMagicActive(false);

//   stopAudioRecording();
//   stopListening();
//   console.log("magic Recording stopped!");

//   if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
//     ws.current.send(JSON.stringify({
//       type: "summarize",
//       text: fullSpeech,
//       timestamp: Date.now(),
//     }));
//   }

//   isProcessingRef.current = false;
// };


//   const handleMagicSpeech = (text) => {
//     let cleanText = text
//       .replace(new RegExp(startKeyword, 'gi'), '')
//       .replace(new RegExp(endKeyword, 'gi'), '')
//       .trim();

//     if (cleanText) {
//       const updatedSpeech = magicSpeech ? magicSpeech + ' ' + cleanText : cleanText;
//       setMagicSpeech(updatedSpeech);
//       setFullSpeech(updatedSpeech);
//       setTranscript(cleanText);

//       if (ws.current?.readyState === WebSocket.OPEN) {
//         ws.current.send(JSON.stringify({ type: "transcript", word: cleanText, timestamp: Date.now() }));
//       }
//     }
//   };

//   // --- Audio Recording ---
//   const initAudioRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 } });
//       const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//       const chunks = [];

//       recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
//       recorder.onstop = async () => {
//         const audioBlob = new Blob(chunks, { type: 'audio/webm' });
//         if (audioBlob.size > 0) await sendAudioToBackendREST(audioBlob);
//         stream.getTracks().forEach(track => track.stop());
//       };

//       setMediaRecorder(recorder);
//       setAudioStream(stream);
//       return recorder;
//     } catch (error) { console.error('Init audio error:', error); return null; }
//   };

//   const startAudioRecording = async () => {
//     if (mediaRecorder?.state === 'recording') return;
//     const recorder = await initAudioRecording();
//     if (recorder) recorder.start(1000);
//   };

//   const stopAudioRecording = () => {
//     if (mediaRecorder?.state === 'recording') {
//       mediaRecorder.stop();
//       setMediaRecorder(null);
//       if (audioStream) audioStream.getTracks().forEach(track => track.stop());
//       setAudioStream(null);
//     }
//   };

//   const sendAudioToBackendREST = async (audioBlob) => {
//     console.log("sending audio to bacend for process");

//     try {
//       const formData = new FormData();
//       formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
//       formData.append('sessionId', sessionId);
//       await axios.post(`${BASE_URL}/upload-audio`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
//     } catch (err) { console.error('Audio upload error:', err); }
//   };

//   // --- Auto-mic on both joined ---
//   useEffect(() => {
//     if (!ws.current || role !== 'magician') return;
//     const handleReady = (event) => {
//       try {
//         const data = JSON.parse(event.data);
//         if (data.type === "ready") startListening();
//       } catch (err) { console.error(err); }
//     };
//     ws.current.addEventListener("message", handleReady);
//     return () => ws.current.removeEventListener("message", handleReady);
//   }, [role, ws]);

//   const handleLogout = () => {
//     if (!window.confirm("Are you sure you want to logout?")) return;
//     window.sessionStorage.clear();
//     window.location.reload();
//   };

//   const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

//   // --- Render ---
//   if (!role) return <LoginPage />;
//   if (!browserSupportsSpeechRecognition) return <div className="container center"><h1>Browser does not support speech recognition</h1></div>;

//   if (role === 'magician') {
//     const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
//     if (!storedUser) {
//       return <LoginPage />;
//     }


//     return (
//       <div className="container magician-view">
//         <div className="header">
//           <button className='logoutBtn' onClick={handleLogout}>Logout</button>
//           <h1>Magic Session</h1>
//           <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
//         </div>

//         <div className='keyword_container'>
//           <div>
//             <label>Start Keyword:</label>
//             <input type="text" value={startKeyword} onChange={e => setStartKeyword(e.target.value)} disabled={listening} />
//           </div>
//           <div>
//             <label>End Keyword:</label>
//             <input type="text" value={endKeyword} onChange={e => setEndKeyword(e.target.value)} disabled={listening} />
//           </div>
//         </div>

//         <div className="recording-controls">
//           <button
//             onClick={async () => {
//               if (isMagicActive) {
//                 await finalizeMagicSession(); // stops mic + recording + sends data
//               } else {
//                 stopListening(); // just stop mic if no active magic
//               }
//             }}
//             className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
//           >
//             🎤 {listening ? 'Stop Speaking' : 'Start Speaking'}
//           </button>
//         </div>


//         {listening && (
//           <span>
//             {isMagicActive ?
//               <span style={{ fontWeight: 'bold', color: 'green' }}>🔴 Magic Active - Recording</span> :
//               <span style={{ color: 'blue' }}> Listening for keywords...</span>
//             }
//           </span>
//         )}

//         {listening && (
//           <div className="listening-status">
//             <h3>You're saying:</h3>
//             <div className="current-transcript">{transcript || "Waiting for speech..."}</div>
//             {isMagicActive && <div className="audio-recording-indicator">🔴 Audio Recording Active - Say "{endKeyword}" to stop</div>}
//           </div>
//         )}

//         <div className="share-info">
//           <p>Ask the spectator to scan this QR code or go to this link:</p>
//           <div className="link-container">
//             <input type="text" value={getSpectatorLink()} readOnly />
//             <button onClick={() => { navigator.clipboard.writeText(getSpectatorLink()); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} className="copy-button">
//               {isCopied ? 'Copied' : "Copy"}
//             </button>
//           </div>
//           <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`} alt="Spectator QR Code" />
//         </div>
//       </div>
//     );
//   }

//   if (role === 'spectator') {
//     return (
//       <div className="container center spectator-view">
//         <div className="header">
//           <h1>Magic Session</h1>
//           <div className={`connection-status ${connectionStatus}`}>Status: {connectionStatus}</div>
//         </div>

//         <div className="transcript-box">
//           {transcript ? <h2>"{transcript}"</h2> : <p>Waiting for the magician to speak...</p>}
//         </div>
//       </div>
//     );
//   }

//   return null;
// }

// export default App;

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
        // const wsUrl = "ws://localhost:3001"
        const wsUrl = "wss://magix-trix.onrender.com"

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

  const isProcessingRef = useRef(false);
  const magicActiveRef = useRef(false);
  const speechBufferRef = useRef('');

  const { ws, connectionStatus } = useWebSocket(sessionId, role);

  // const BASE_URL = "http://localhost:3001/api"
  const BASE_URL = 'https://magix-trix.onrender.com/api'

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

  // --- Improved Keyword detection ---
  useEffect(() => {
    if (role !== 'magician' || !speechTranscript || isProcessingRef.current) return;

    const lowerText = speechTranscript.toLowerCase();
    const containsStart = lowerText.includes(startKeyword.toLowerCase());
    const containsEnd = lowerText.includes(endKeyword.toLowerCase());

    // Buffer speech to avoid rapid state updates
    speechBufferRef.current = speechTranscript;

    if (containsStart && containsEnd) {
      if (magicActiveRef.current) {
        finalizeMagicSession();
      }
      return;
    }

    if (containsStart && !magicActiveRef.current) {
      handleStartMagic();
    } else if (containsEnd && magicActiveRef.current) {
      finalizeMagicSession();
    } else if (magicActiveRef.current) {
      handleMagicSpeech(speechBufferRef.current);
    }
  }, [speechTranscript, role, startKeyword, endKeyword]);

  // --- Handlers ---
  const handleStartMagic = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    console.log("🎯 Magic session STARTED");
    magicActiveRef.current = true;
    setIsMagicActive(true);
    setMagicSpeech('');
    setFullSpeech('');
    resetTranscript();
    
    // Start audio recording first, then ensure speech recognition continues
    await startAudioRecording();
    
    isProcessingRef.current = false;
  };

  const finalizeMagicSession = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    console.log("🎯 Magic session STOPPED");
    magicActiveRef.current = false;
    setIsMagicActive(false);

    // Stop audio recording but keep speech recognition running
    stopAudioRecording();
    
    // Send final speech data
    if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "summarize",
        text: fullSpeech,
        timestamp: Date.now(),
      }));
    }

    // Clear buffers
    speechBufferRef.current = '';
    resetTranscript();
    
    isProcessingRef.current = false;
  };

  const handleMagicSpeech = useCallback((text) => {
    if (!text.trim()) return;

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
  }, [magicSpeech, startKeyword, endKeyword, ws]);

  // --- Improved Audio Recording ---
  const initAudioRecording = async () => {
    try {
      // Stop any existing streams first
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
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
      const chunks = [];

      recorder.ondataavailable = (event) => { 
        if (event.data.size > 0) chunks.push(event.data); 
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          await sendAudioToBackendREST(audioBlob);
        }
        // Don't stop the stream here - let it be managed by the component
      };

      setMediaRecorder(recorder);
      setAudioStream(stream);
      return recorder;
    } catch (error) { 
      console.error('Init audio error:', error); 
      return null; 
    }
  };

  const startAudioRecording = async () => {
    if (mediaRecorder?.state === 'recording') {
      console.log("Audio recording already in progress");
      return;
    }
    
    const recorder = mediaRecorder || await initAudioRecording();
    if (recorder && recorder.state === 'inactive') {
      recorder.start(1000);
      console.log("Audio recording started");
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      console.log("Audio recording stopped");
    }
    
    // Clean up audio stream
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    setMediaRecorder(null);
  };

  const sendAudioToBackendREST = async (audioBlob) => {
    console.log("Sending audio to backend for processing");
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      await axios.post(`${BASE_URL}/upload-audio`, formData, { 
        headers: { 'Content-Type': 'multipart/form-data' }, 
        timeout: 300000 
      });
    } catch (err) { 
      console.error('Audio upload error:', err); 
    }
  };

  // --- Auto-mic on both joined ---
  useEffect(() => {
    if (!ws.current || role !== 'magician') return;
    
    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready" && !listening) {
          console.log("Starting speech recognition");
          startListening();
        }
      } catch (err) { 
        console.error("WebSocket message error:", err); 
      }
    };
    
    ws.current.addEventListener("message", handleReady);
    return () => ws.current?.removeEventListener("message", handleReady);
  }, [role, ws, listening, startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
      stopListening();
    };
  }, [audioStream, stopListening]);

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    window.sessionStorage.clear();
    window.location.reload();
  };

  const getSpectatorLink = () => 
    `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  // --- Render ---
  if (!role) return <LoginPage />;
  if (!browserSupportsSpeechRecognition) return <div className="container center"><h1>Browser does not support speech recognition</h1></div>;

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
    if (!storedUser) {
      return <LoginPage />;
    }

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
            <input type="text" value={startKeyword} onChange={e => setStartKeyword(e.target.value)} disabled={listening} />
          </div>
          <div>
            <label>End Keyword:</label>
            <input type="text" value={endKeyword} onChange={e => setEndKeyword(e.target.value)} disabled={listening} />
          </div>
        </div>

        <div className="recording-controls">
          <button
            onClick={async () => {
              if (listening) {
                stopListening();
                if (isMagicActive) {
                  await finalizeMagicSession();
                }
              } else {
                startListening();
              }
            }}
            className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
          >
            🎤 {listening ? 'Stop Listening' : 'Start Listening'}
          </button>
        </div>

        {listening && (
          <div className="listening-status">
            <span>
              {isMagicActive ?
                <span style={{ fontWeight: 'bold', color: 'green' }}>🔴 Magic Active - Recording</span> :
                <span style={{ color: 'blue' }}> Listening for keywords...</span>
              }
            </span>
            
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
              {isCopied ? 'Copied' : "Copy"}
            </button>
          </div>
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getSpectatorLink())}`} 
            alt="Spectator QR Code" 
          />
        </div>

        {/* Debug info */}
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
          <p>Debug: Listening: {listening ? 'Yes' : 'No'}, Magic Active: {isMagicActive ? 'Yes' : 'No'}</p>
          <p>Current Buffer: {speechBufferRef.current.substring(0, 50)}...</p>
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