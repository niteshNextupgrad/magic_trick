// // src/hooks/useSpeechToText.js
// import { useState, useEffect, useRef } from "react";

// export const useSpeechToText = (lang = "en-US") => {
//   const [transcript, setTranscript] = useState("");
//   const [listening, setListening] = useState(false);
//   const [supported, setSupported] = useState(true);

//   const recognitionRef = useRef(null);

//   useEffect(() => {
//     const SpeechRecognition =
//       window.SpeechRecognition || window.webkitSpeechRecognition;

//     if (!SpeechRecognition) {
//       setSupported(false);
//       return;
//     }

//     const recognition = new SpeechRecognition();
//     recognition.continuous = true;
//     recognition.interimResults = true;
//     recognition.lang = lang;

//     recognition.onresult = (event) => {
//       let text = "";
//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         text += event.results[i][0].transcript;
//       }
//       setTranscript(text.trim());
//     };

//     recognition.onstart = () => setListening(true);

//     recognition.onend = () => {
//       setListening(false);
//       // Auto-restart if user didn’t explicitly stop
//       if (recognitionRef.current?.shouldRestart) {
//         recognition.start();
//       }
//     };

//     recognitionRef.current = recognition;
//     recognitionRef.current.shouldRestart = false;

//     return () => recognition.stop();
//   }, [lang]);

//   const startListening = () => {
//     if (recognitionRef.current) {
//       recognitionRef.current.shouldRestart = true;
//       recognitionRef.current.start();
//       setListening(true);
//     }
//   };

//   const stopListening = () => {
//     if (recognitionRef.current) {
//       recognitionRef.current.shouldRestart = false;
//       recognitionRef.current.stop();
//       setListening(false);
//     }
//   };

//   const resetTranscript = () => setTranscript("");

//   return {
//     transcript,
//     listening,
//     supported,
//     startListening,
//     stopListening,
//     resetTranscript,
//   };
// };
import { useState, useEffect, useRef, useCallback } from "react";

export const useSpeechToText = (lang = "en-US") => {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Speech recognition started");
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      // Update transcript with both final and interim results
      if (finalText) {
        setTranscript(prev => prev + " " + finalText);
      } else if (interimText) {
        setTranscript(interimText);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setError(event.error);
      setListening(false);
      
      // Auto-restart on certain errors
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        restartTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current?.autoRestart) {
            startListening();
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");
      setListening(false);
      
      // Auto-restart if enabled
      if (recognitionRef.current?.autoRestart) {
        restartTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current?.autoRestart) {
            try {
              recognition.start();
              console.log("Auto-restarting speech recognition");
            } catch (err) {
              console.error("Failed to auto-restart:", err);
              // Retry after longer delay
              setTimeout(() => {
                if (recognitionRef.current?.autoRestart) {
                  startListening();
                }
              }, 2000);
            }
          }
        }, 500);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      recognition.stop();
    };
  }, [lang]);

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.autoRestart = true;
        recognitionRef.current.start();
        console.log("Manual start of speech recognition");
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        // Retry once
        setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.start();
          }
        }, 100);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.autoRestart = false;
      recognitionRef.current.stop();
      console.log("Manual stop of speech recognition");
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    transcript,
    listening,
    supported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
};