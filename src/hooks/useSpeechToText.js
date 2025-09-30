import { useState, useEffect, useRef, useCallback } from "react";

export const useSpeechToText = (lang = "en-US") => {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef(null);
  const isManualStopRef = useRef(false);
  const restartTimeoutRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("❌ Speech Recognition not supported in this browser");
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    // Handle speech results
    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece + " ";
        } else {
          interimTranscript += transcriptPiece;
        }
      }

      // Use final transcript if available, otherwise interim
      const currentTranscript = (finalTranscript || interimTranscript).trim();
      if (currentTranscript) {
        setTranscript(currentTranscript);
      }
    };

    // Handle recognition start
    recognition.onstart = () => {
      console.log("🎤 Speech Recognition Started");
      setListening(true);
      isManualStopRef.current = false;
    };

    // Handle recognition end
    recognition.onend = () => {
      console.log("🛑 Speech Recognition Ended");
      setListening(false);

      // Auto-restart if not manually stopped
      if (!isManualStopRef.current) {
        console.log("🔄 Auto-restarting speech recognition...");
        // Small delay before restart to prevent rapid fire restarts
        restartTimeoutRef.current = setTimeout(() => {
          try {
            if (recognitionRef.current && !isManualStopRef.current) {
              recognitionRef.current.start();
            }
          } catch (error) {
            console.error("❌ Auto-restart error:", error);
          }
        }, 100);
      }
    };

    // Handle errors
    recognition.onerror = (event) => {
      console.error("❌ Speech Recognition Error:", event.error);
      
      // Handle specific errors
      switch (event.error) {
        case "no-speech":
          console.log("ℹ️ No speech detected, continuing...");
          break;
        case "audio-capture":
          console.error("❌ No microphone was found or microphone is blocked");
          setListening(false);
          isManualStopRef.current = true;
          break;
        case "not-allowed":
          console.error("❌ Microphone permission denied");
          setListening(false);
          isManualStopRef.current = true;
          break;
        case "aborted":
          console.log("ℹ️ Recognition aborted");
          break;
        case "network":
          console.error("❌ Network error occurred");
          break;
        default:
          console.error("❌ Unknown error:", event.error);
      }
    };

    recognitionRef.current = recognition;

    // Cleanup function
    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        isManualStopRef.current = true;
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error("Cleanup error:", error);
        }
      }
    };
  }, [lang]);

  // Start listening function
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      console.error("❌ Speech Recognition not initialized");
      return;
    }

    // Clear any pending restart timeouts
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    isManualStopRef.current = false;

    try {
      // Check if already running
      if (listening) {
        console.log("ℹ️ Already listening");
        return;
      }

      recognitionRef.current.start();
      console.log("▶️ Starting speech recognition...");
    } catch (error) {
      console.error("❌ Start listening error:", error);
      
      // If already started, just update state
      if (error.message && error.message.includes("already started")) {
        console.log("ℹ️ Recognition already active");
        setListening(true);
      }
    }
  }, [listening]);

  // Stop listening function
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) {
      console.error("❌ Speech Recognition not initialized");
      return;
    }

    // Clear any pending restart timeouts
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    // Set manual stop flag to prevent auto-restart
    isManualStopRef.current = true;

    try {
      recognitionRef.current.stop();
      console.log("⏹️ Stopping speech recognition...");
      setListening(false);
    } catch (error) {
      console.error("❌ Stop listening error:", error);
      setListening(false);
    }
  }, []);

  // Reset transcript function
  const resetTranscript = useCallback(() => {
    console.log("🔄 Resetting transcript");
    setTranscript("");
  }, []);

  return {
    transcript,
    listening,
    supported,
    startListening,
    stopListening,
    resetTranscript,
  };
};