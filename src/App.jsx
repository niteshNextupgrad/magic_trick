import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import LoginPage from './Login';
import RecordRTC from 'recordrtc';
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
                navigator.vibrate([1000, 200, 1000, 200, 1000]); //long vibrate to notify 
                setTimeout(() => {
                  window.location.reload()
                }, 5000)
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

  // Audio recording refs
  const recorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);

  const { ws, connectionStatus } = useWebSocket(sessionId, role);


  const BASE_URL = 'https://magix-trix.onrender.com/api'
  // const BASE_URL = 'http://localhost:3001/api'

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

  const initAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,    // boosts low voices automatically
          channelCount: 1,
          sampleRate: 44100,
        }
      });
      audioStreamRef.current = stream;

      const recorder = RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000, // good for Deepgram ASR
        timeSlice: 1000,
        ondataavailable: (blob) => {
          // optional real-time chunking
        }
      });

      recorderRef.current = recorder;
      return true;
    } catch (error) {
      console.error('Error initializing audio recording:', error);
      return false;
    }
  };


  const startAudioRecording = async () => {
    if (!recorderRef.current) {
      const success = await initAudioRecording();
      if (!success) return;
    }

    try {
      recorderRef.current.startRecording();
      setIsRecording(true);
      console.log('Audio recording started');
    } catch (error) {
      console.error('Error starting audio recording:', error);
    }
  };

  const stopAudioRecording = () => {
    if (recorderRef.current && isRecording) {
      return new Promise((resolve) => {
        recorderRef.current.stopRecording(() => {
          const blob = recorderRef.current.getBlob();
          setRecordedAudioBlob(blob);
          setIsRecording(false);
          console.log('Audio recording stopped, blob size:', blob.size);

          // Clean up stream
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
          }

          resolve(blob);
        });
      });
    }
    return Promise.resolve(null);
  };

  useEffect(() => {
    if (role !== 'magician' || !speechTranscript) return;

    let lowerText = speechTranscript.toLowerCase();
    let cleanText = speechTranscript;

    // Start Magic behalf of the keyword...
    if (!isMagicActive && lowerText.includes(startKeyword)) {
      console.log("Magic recording started!");
      setIsMagicActive(true);
      setMagicSpeech('');
      setFullSpeech(''); //reset fullSpeech
      startAudioRecording(); // Start audio recording
      return;
    }

    // Stop Magic behalf of the keyword...
    if (isMagicActive && lowerText.includes(endKeyword)) {
      setIsMagicActive(false);
      stopAudioRecording().then(audioBlob => {
        setRecordedAudioBlob(audioBlob); // store blob

        // Send audio to backend via REST
        if (audioBlob && audioBlob.size > 0) {
          sendAudioToBackendREST(audioBlob);
        }

        // Also send fullSpeech to WebSocket for summarization
        if (fullSpeech.trim() && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: "summarize",
            text: fullSpeech,
            timestamp: Date.now()
          }));
        }
      });
    }


    // If magic is active, accumulate speech and send to spectator
    if (isMagicActive) {
      cleanText = cleanText.replace(new RegExp(startKeyword, 'gi'), '')
        .replace(new RegExp(endKeyword, 'gi'), '')
        .trim();
      if (cleanText) {
        setMagicSpeech(prev => prev ? prev + ' ' + cleanText : cleanText);
        // setFullSpeech(prev => prev ? prev + ' ' + cleanText : cleanText);
        setFullSpeech(cleanText)

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: "test",
            message: cleanText,
            timestamp: Date.now()
          }));
        }

        setTranscript(cleanText);
      }
    }
  }, [speechTranscript]);

  // Function to send audio blob to backend
  const sendAudioToBackendREST = async (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, `magic_audio_${Date.now()}.wav`);
    formData.append('sessionId', sessionId);

    try {
      const response = await axios.post(`${BASE_URL}/upload-audio`, formData)
      const result = await response.data;
      console.log('Audio uploaded, backend response:', result);
    } catch (err) {
      console.error('Error uploading audio:', err);
    }
  };


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

  // Auto-start listening when both joined and stop when complete
  useEffect(() => {
    if (!ws.current) return;

    const handleReady = (event) => {
      try {
        const data = JSON.parse(event.data);

        // start recording when both joined the session
        if (data.type === "ready" && role === "magician") {
          console.log("Spectator is connected — starting recording...");
          startListening();
        }
        // Stop recording when summary received
        if (data.type === "summarize_complete" && role === "magician") {
          console.log("Summary complete — stopping recording");
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
        SpeechRecognition.startListening({ continuous: true });
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

        console.log("Stopped listening and sending transcript...");

        // Stop audio recording if active
        if (isRecording) {
          stopAudioRecording().then((audioBlob) => {
            // Send fullSpeech accumulated during magic session
            if (ws.current && ws.current.readyState === WebSocket.OPEN && fullSpeech.trim()) {
              ws.current.send(JSON.stringify({
                type: "summarize",
                text: fullSpeech,
                timestamp: Date.now(),
              }));

              // Send audio if recorded
              if (audioBlob && audioBlob.size > 0) {
                sendAudioToBackendREST(audioBlob);
              }
            }
          });
        } else {
          // Send just the text if no audio recording
          if (ws.current && ws.current.readyState === WebSocket.OPEN && fullSpeech.trim()) {
            ws.current.send(JSON.stringify({
              type: "summarize",
              text: fullSpeech,
              timestamp: Date.now(),
            }));
          }
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

  // Update isListening state based on speech recognition
  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

  // Share link for spectator
  const getSpectatorLink = () => `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  if (!role) {
    return <LoginPage />
  }

  if (role === 'magician') {
    const storedUser = JSON.parse(window.sessionStorage.getItem("user"))
    if (!storedUser) {
      return <LoginPage />
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
          <h1>Magic Session </h1>
          <div className={`connection-status ${connectionStatus}`}>
            Status: {connectionStatus}
          </div>
        </div>
        <div className='keyword_container'>
          <div>
            <label>Start Keyword:</label>
            <input type="text" placeholder='Enter Start Keyword' onChange={(e) => setStartKeyword(e.target.value)} disabled={isListening} value={startKeyword} />
          </div>
          <div>
            <label>End Keyword:</label>
            <input type="text" placeholder='Enter End Keyword' onChange={(e) => setEndKeyword(e.target.value)} disabled={isListening} value={endKeyword} />
          </div>
        </div>

        <div className="recording-controls">
          <button onClick={isListening ? stopListening : startListening} className={`control-button ${isListening ? 'stop-button' : 'start-button'}`} >
            🎤 {isListening ? 'Stop Speaking' : 'Start Speaking'}
          </button>
        </div>
        {
          isListening && <span>{isMagicActive ? <span style={{ fontWeight: 'bold' }}>Listening Started</span> : 'Waiting for the keyword to start'}</span>
        }

        {isListening && (
          <div className="listening-status">
            <h3>You're saying:</h3>
            <div className="current-transcript">
              {transcript || "Waiting for speech..."}
            </div>
            {isRecording && (
              <div className="audio-recording-indicator">
                🔴 Audio Recording Active
              </div>
            )}
          </div>
        )}

        <div className="share-info">
          <p>Ask the spectator to scan this QR code or go to this link:</p>
          <div className="link-container">
            <input type="text" value={getSpectatorLink()} readOnly />
            <button onClick={() => { navigator.clipboard.writeText(getSpectatorLink()); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000) }} className="copy-button">{isCopied ? 'Copied' : "Copy"}</button>
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