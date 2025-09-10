import React, { useState, useEffect } from 'react';

const SpectatorView = ({ 
  sessionId, 
  connectionStatus, 
  speechTranscript, 
  listening, 
  onStartListening, 
  onStopListening,
  onSendTestMessage,
  onRequestSummarization,
  ws
}) => {
  const [fullSpeech, setFullSpeech] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');

  // Accumulate speech for summarization
  useEffect(() => {
    if (speechTranscript && speechTranscript !== lastTranscript) {
      // Only add new words, not the entire transcript each time
      const newWords = speechTranscript.replace(lastTranscript, '').trim();
      if (newWords) {
        setFullSpeech(prev => prev ? prev + ' ' + newWords : newWords);
        setLastTranscript(speechTranscript);
      }
    }
  }, [speechTranscript, lastTranscript]);

  const handleStopListening = () => {
    const currentSpeech = fullSpeech;
    onStopListening();
    // Send speech for summarization when stopping
    if (currentSpeech) {
      onRequestSummarization(currentSpeech);
    }
  };

  const resetFullSpeech = () => {
    setFullSpeech('');
    setLastTranscript('');
  };

  return (
    <div className="container center spectator-view">
      <div className="header">
        <h1>Session: {sessionId}</h1>
        <div className={`connection-status ${connectionStatus}`}>
          Status: {connectionStatus}
        </div>
      </div>

      <h1>Speak any Word</h1>
      <div className="recording-controls">
        <button
          onClick={listening ? handleStopListening : onStartListening}
          className={`control-button ${listening ? 'stop-button' : 'start-button'}`}
        >
          {listening ? '⏹️ Stop Listening' : '🎤 Start Speaking'}
        </button>
      </div>

      {listening && (
        <div className="listening-status">
          <div className="current-transcript">
            {speechTranscript || "Waiting for speech..."}
          </div>
        </div>
      )}

      <div className="debug-info">
        <h3>Debug Information</h3>
        <p>Accumulated speech length: {fullSpeech.length} characters</p>
        <button onClick={() => console.log('Full speech:', fullSpeech)} className="test-button">
          Log Full Speech
        </button>
        <button onClick={resetFullSpeech} className="test-button">
          Reset Speech
        </button>
      </div>

      <div className="test-buttons">
        <h3>Test Messages</h3>
        <button onClick={() => onSendTestMessage("this is a normal test message!")} className="test-button">
          Send Test Message
        </button>
        <button onClick={() => onSendTestMessage("this is a normal MAGIC WORD test message")} className="test-button">
          Send Magic Word
        </button>
        <button onClick={() => onRequestSummarization(fullSpeech)} className="test-button" disabled={!fullSpeech}>
          Summarize My Speech
        </button>
      </div>
    </div>
  );
};

export default SpectatorView;