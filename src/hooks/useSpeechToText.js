// src/hooks/useSpeechToText.js
import { useState, useEffect, useRef } from "react";

export const useSpeechToText = (lang = "en-US") => {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef(null);

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

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text.trim());
    };

    recognition.onstart = () => setListening(true);

    recognition.onend = () => {
      setListening(false);
      // Auto-restart if user didn’t explicitly stop
      if (recognitionRef.current?.shouldRestart) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognitionRef.current.shouldRestart = false;

    return () => recognition.stop();
  }, [lang]);

  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.shouldRestart = true;
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.shouldRestart = false;
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  const resetTranscript = () => setTranscript("");

  return {
    transcript,
    listening,
    supported,
    startListening,
    stopListening,
    resetTranscript,
  };
};
