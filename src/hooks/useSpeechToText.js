import { useState, useEffect, useRef, useCallback } from "react";

export const useSpeechToText = (lang = "en-US") => {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);

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

    // Add mobile-specific optimizations
    if (navigator.userAgent.match(/Android|iPhone|iPad|iPod/i)) {
      recognition.interimResults = false; // Better performance on mobile
    }

    recognition.onstart = () => {
      console.log("🎤 Speech recognition started");
      setListening(true);
      setError(null);
      isStartingRef.current = false;
      retryCountRef.current = 0;
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interimText += transcript;
        }
      }

      // Update transcript
      if (finalText) {
        setTranscript(finalText.trim());
      } else if (interimText) {
        setTranscript(interimText);
      }
    };

    recognition.onerror = (event) => {
      console.error("🎤 Speech recognition error:", event.error);
      setError(event.error);
      setListening(false);
      isStartingRef.current = false;

      // Handle specific errors
      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          setError('Microphone permission denied. Please allow microphone access.');
          break;
        case 'audio-capture':
          setError('No microphone found. Please check your audio device.');
          break;
        case 'network':
          setError('Network error occurred during speech recognition.');
          break;
        default:
          setError(`Speech recognition error: ${event.error}`);
      }

      // Auto-retry for recoverable errors (with backoff)
      if (['aborted', 'network', 'audio-capture'].includes(event.error)) {
        if (recognitionRef.current?.shouldRestart && retryCountRef.current < 3) {
          retryCountRef.current++;
          const retryDelay = Math.min(1000 * retryCountRef.current, 5000);
          console.log(`🔄 Retrying speech recognition in ${retryDelay}ms (attempt ${retryCountRef.current})`);
          
          restartTimeoutRef.current = setTimeout(() => {
            if (recognitionRef.current?.shouldRestart) {
              startListening();
            }
          }, retryDelay);
        }
      }
    };

    recognition.onend = () => {
      console.log("🎤 Speech recognition ended");
      setListening(false);
      isStartingRef.current = false;

      // Clear any pending restart timeouts
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      // Auto-restart if enabled (with longer delay for mobile)
      if (recognitionRef.current?.shouldRestart && !isStoppingRef.current) {
        const restartDelay = navigator.userAgent.match(/Android|iPhone|iPad|iPod/i) ? 500 : 200;
        
        restartTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current?.shouldRestart && !isStoppingRef.current) {
            console.log("🔄 Auto-restarting speech recognition");
            startListening();
          }
        }, restartDelay);
      }
    };

    recognitionRef.current = recognition;

    // Cleanup function
    return () => {
      console.log("🧹 Cleaning up speech recognition");
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      isStoppingRef.current = true;
      recognitionRef.current.shouldRestart = false;
      try {
        recognition.stop();
      } catch (err) {
        // Ignore errors during cleanup
      }
    };
  }, [lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || listening || isStartingRef.current) {
      console.log("⚠️ Cannot start - already listening or starting");
      return;
    }

    console.log("🎤 Starting speech recognition...");
    recognitionRef.current.shouldRestart = true;
    isStartingRef.current = true;
    isStoppingRef.current = false;
    setError(null);

    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error("❌ Failed to start speech recognition:", err);
      isStartingRef.current = false;
      
      // Retry once after short delay
      setTimeout(() => {
        if (recognitionRef.current?.shouldRestart && !isStartingRef.current) {
          try {
            recognitionRef.current.start();
          } catch (retryErr) {
            console.error("❌ Retry also failed:", retryErr);
            setError('Failed to start speech recognition. Please refresh the page.');
          }
        }
      }, 300);
    }
  }, [listening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) {
      console.log("⚠️ No recognition instance to stop");
      return;
    }

    console.log("🛑 Stopping speech recognition...");
    recognitionRef.current.shouldRestart = false;
    isStoppingRef.current = true;
    
    // Clear any pending restarts
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("Error stopping speech recognition:", err);
    }
    
    setListening(false);
    isStartingRef.current = false;
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