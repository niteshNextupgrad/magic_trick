import { useState, useEffect, useRef } from 'react';
import SpeechRecognition, {useSpeechRecognition} from 'react-speech-recognition';

export const useSpeechRecognitionHook = () => {
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [fullSpeech, setFullSpeech] = useState('');
  const silenceTimerRef = useRef(null);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  // Update our state when the transcript changes
  useEffect(() => {
    setSpeechTranscript(transcript);
  }, [transcript]);

  // Auto-stop after 5 seconds of silence
  useEffect(() => {
    if (listening) {
      // Clear any existing timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Set new timer to stop after 5 seconds of no speech
      silenceTimerRef.current = setTimeout(() => {
        if (listening) {
          console.log('⏰ No speech detected for 5 seconds, stopping...');
          stopListening();
        }
      }, 5000);
    }

    // Cleanup on unmount
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [listening, speechTranscript]);

  // Accumulate speech for summarization
  useEffect(() => {
    if (speechTranscript && speechTranscript !== lastTranscript) {
      // Only add new words, not the entire transcript each time
      const newWords = speechTranscript.replace(lastTranscript, '').trim();
      if (newWords) {
        setFullSpeech(prev => prev ? prev + ' ' + newWords : newWords);
        setLastTranscript(speechTranscript);
        console.log('Added to full speech:', newWords);
      }
    }
  }, [speechTranscript, lastTranscript]);

  const startListening = async () => {
    try {
      console.log('Microphone permission granted');
      SpeechRecognition.startListening({ continuous: true });
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please allow microphone permissions to use speech recognition');
    }
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    resetTranscript();
    
    // Clear the silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    return fullSpeech;
  };

  const resetFullSpeech = () => {
    setFullSpeech('');
    setLastTranscript('');
    resetTranscript();
  };

  return {
    speechTranscript,
    listening,
    resetTranscript,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    fullSpeech,
    resetFullSpeech
  };
};