import React from 'react';

const MagicianView = ({ sessionId, connectionStatus, transcript, onCopyLink }) => {
  const getSpectatorLink = () =>
    `${window.location.origin}${window.location.pathname}?role=spectator&session=${sessionId}`;

  return (
    <div className="container magician-view">
      <div className="header">
        <h1>Magic Session: {sessionId}</h1>
        <div className={`connection-status ${connectionStatus}`}>
          Status: {connectionStatus}
        </div>
      </div>

      <h2>The Secret Word</h2>
      <div className="transcript-box">
        {transcript ? <h1>"{transcript}"</h1> : <p>Waiting for the spectator to speak a word...</p>}
      </div>

      <div className="share-info">
        <p>Ask the spectator to scan this QR code or go to this link:</p>
        <div className="link-container">
          <input type="text" value={getSpectatorLink()} readOnly />
          <button onClick={onCopyLink} className="copy-button">Copy</button>
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
};

export default MagicianView;