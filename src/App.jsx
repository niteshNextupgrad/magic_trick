import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import LoginPage from './Login';
import axios from 'axios';

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
                navigator.vibrate([1000, 200, 1000, 200, 1000]);
                // setTimeout(() => {
                //   window.location.reload()
                // }, 5000)
              } else if (navigator.vibrate) {
                navigator.vibrate([100, 200, 100]);
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
              console.log("Attempting reconnect...");
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
  const [isMagicActive, setIsMagicActive] = useState(false);
  const [magicSpeech, setMagicSpeech] = useState('');
  const [isCopied, setIsCopied] = useState(false)
  const [startKeyword, setStartKeyword] = useState("start magic")
  const [endKeyword, setEndKeyword] = useState("stop magic")
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioStream, setAudioStream] = useState(null);

  // Refs to prevent re-render issues
  const isProcessingRef = useRef(false);
  const magicActiveRef = useRef(false);

  const { ws, connectionStatus } = useWebSocket(sessionId, role);

  const BASE_URL = 'https://magix-trix.onrender.com/api'
  // const BASE_URL = 'http://localhost:3001/api'

  const handleLogout = () => {
    if (!confirm("Are you sure, want to logout?")) return;
    window.sessionStorage.clear()
    window.location.reload()
  };

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

  // Initialize audio recording
  const initAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        } 
      });
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      
      const chunks = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          console.log('Audio blob created, size:', audioBlob.size);
          
          if (audioBlob.size > 0) {
            await sendAudioToBackendREST(audioBlob);
          }
        } catch (error) {
          console.error('Error processing recorded audio:', error);
        } finally {
          // Clean up stream
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
        }
      };
      
      setMediaRecorder(recorder);
      setAudioStream(stream);
      return recorder;
    } catch (error) {
      console.error('Error initializing audio recording:', error);
      return null;
    }
  };

  const startAudioRecording = async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('Audio recording already in progress');
      return;
    }

    const recorder = await initAudioRecording();
    if (recorder) {
      recorder.start(1000); // Collect data every second
      console.log('Audio recording started');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      console.log('Audio recording stopped');
      setMediaRecorder(null);
      
      // Clean up stream
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
      }
    }
  };

  // Main speech processing logic with debouncing
  useEffect(() => {
    if (role !== 'magician' || !speechTranscript || isProcessingRef.current) return;

    const lowerText = speechTranscript.toLowerCase();
    const containsStart = lowerText.includes(startKeyword.toLowerCase());
    const containsEnd = lowerText.includes(endKeyword.toLowerCase());

    // Prevent simultaneous start/stop processing
    if (containsStart && containsEnd) {
      console.log('Both start and end keywords detected, prioritizing stop');
      // Process stop first, then ignore start
      if (magicActiveRef.current) {
        handleStopMagic();
      }
      return;
    }

    if (containsStart && !magicActiveRef.current) {
      handleStartMagic();
    } else if (containsEnd && magicActiveRef.current) {
      handleStopMagic();
    } else if (magicActiveRef.current) {
      // Normal speech during magic session
      handleMagicSpeech(speechTranscript);
    }
  }, [speechTranscript, role]);

  const handleStartMagic = async () => {
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log("Magic recording started!");
    
    magicActiveRef.current = true;
    setIsMagicActive(true);
    setMagicSpeech('');
    setFullSpeech('');
    
    await startAudioRecording();
    isProcessingRef.current = false;
  };

  const handleStopMagic = () => {
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log("Magic recording stopped!");
    
    magicActiveRef.current = false;
    setIsMagicActive(false);
    
    stopAudioRecording();
    
    // Send full speech for summarization
    if (fullSpeech.trim() && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "summarize",
        text: fullSpeech,
        timestamp: Date.now()
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

      // Send live transcript to spectator
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: "test",
          message: cleanText,
          timestamp: Date.now()
        }));
      }
    }
  };

  // Function to send audio blob to backend
  const sendAudioToBackendREST = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `magic_audio_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);

      console.log('Sending audio to backend, size:', audioBlob.size);
      
      const response = await axios.post(`${BASE_URL}/upload-audio`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000
      });
      console.log('Audio uploaded successfully:', response.data);
    } catch (err) {
      console.error('Error uploading audio:', err);
      if (err.response) {
        console.error('Response data:', err.response.data);
        console.error('Response status:', err.response.status);
      }
    }
  };

  // Spectator message handling
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

  // Auto-start/stop listening based on session readiness
  useEffect(() => {
    if (!ws.current) return;

    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "ready" && role === "magician") {
          console.log("Spectator connected — starting listening...");
          startListening();
        }
        
        if (data.type === "summarize_complete" && role === "magician") {
          console.log("Summary complete — stopping listening");
          stopListening();
        }
      } catch (err) {
        console.error("Error in ready handler:", err);
      }
    };
    
    ws.current.addEventListener("message", handleReady);

    return () => {
      ws.current.removeEventListener("message", handleReady);
    };
  }, [role, ws]);

  const startListening = () => {
    if (role === 'magician') {
      try {
        SpeechRecognition.startListening({ 
          continuous: true,
          language: 'en-US'
        });
        setIsListening(true);
        resetTranscript();
        setFullSpeech('');
        console.log("Started listening...");
      } catch (error) {
        console.error("Error starting recognition:", error);
      }
    }
  };

  const stopListening = () => {
    if (role === 'magician') {
      try {
        SpeechRecognition.stopListening();
        setIsListening(false);
        setIsMagicActive(false);
        magicActiveRef.current = false;

        console.log("Stopped listening");

        // Stop audio recording if active
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopAudioRecording();
        }

        // Send final speech for summarization
        if (ws.current?.readyState === WebSocket.OPEN && fullSpeech.trim()) {
          ws.current.send(JSON.stringify({
            type: "summarize",
            text: fullSpeech,
            timestamp: Date.now(),
          }));
        }

        resetTranscript();
        setTranscript('');
        setMagicSpeech('');
        setFullSpeech('');
      } catch (error) {
        console.error("Error stopping recognition:", error);
      }
    }
  };

  // Sync listening state
  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mediaRecorder, audioStream]);

  // Share link for spectator
  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  if (!role) {
    return <LoginPage />;
  }

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"));
    if (!storedUser) {
      return <LoginPage />;
    }
    
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
          <button className='logoutBtn' onClick={handleLogout}>Logout</button>
          <h1>Magic Session</h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>
        
        <div className='keyword_container'>
          <div>
            <label>Start Keyword:</label>
            <input 
              type="text" 
              placeholder='Enter Start Keyword' 
              onChange={(e) => setStartKeyword(e.target.value)} 
              disabled={isListening} 
              value={startKeyword} 
            />
          </div>
          <div>
            <label>End Keyword:</label>
            <input 
              type="text" 
              placeholder='Enter End Keyword' 
              onChange={(e) => setEndKeyword(e.target.value)} 
              disabled={isListening} 
              value={endKeyword} 
            />
          </div>
        </div>

        <div className="recording-controls">
          <button 
            onClick={isListening ? stopListening : startListening} 
            className={`control-button ${isListening ? 'stop-button' : 'start-button'}`}
          >
            🎤 {isListening ? 'Stop Speaking' : 'Start Speaking'}
          </button>
        </div>
        
        {isListening && (
          <span>
            {isMagicActive ? 
              <span style={{ fontWeight: 'bold', color: 'green' }}>🔴 Magic Active - Recording</span> : 
              <span style={{ color: 'blue' }}> Listening for keywords...</span>
            }
          </span>
        )}

        {isListening && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">
              {transcript || "Waiting for speech..."}
            </div>
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
            <button 
              onClick={() => { 
                navigator.clipboard.writeText(getSpectatorLink()); 
                setIsCopied(true); 
                setTimeout(() => setIsCopied(false), 2000);
              }} 
              className="copy-button"
            >
              {isCopied ? 'Copied' : "Copy"}
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
          <h1>Magic Session</h1>
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