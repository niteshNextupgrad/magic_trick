import React from 'react';

const RoleSelection = ({ onCreateSession }) => {
  return (
    <div className="container center">
      <h1>AI Magic Trick</h1>
      <p>Create a session as the magician and share the link with spectators</p>
      <button onClick={onCreateSession} className="role-button">
        Create Magic Session
      </button>
    </div>
  );
};

export default RoleSelection;