import { useState, useEffect, useRef } from 'react';

export const useWebSocket = (sessionId, role) => {
  const ws = useRef(null);
  const [transcript, setTranscript] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectInterval = useRef(null);

  useEffect(() => {
    if (sessionId && role) {
      const connect = () => {
        console.log('🔄 Attempting WebSocket connection...');
        const wsUrl = "ws://localhost:3001";

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log('✅ WebSocket Connected');
          setConnectionStatus('connected');
          clearInterval(reconnectInterval.current);
          ws.current.send(JSON.stringify({ type: 'join', sessionId, role }));
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("📩 Received message:", data);

            if (data.type === 'transcript' && role === 'magician') {
              console.log("Full transcript received:", data.word);
              setTranscript(data.word);
              if (navigator.vibrate) navigator.vibrate(200);
            }

            if (data.type === 'joined') {
              console.log("Successfully joined session:", data.sessionId);
            }

            // Handle summary response
            if (data.type === 'summary' && role === 'spectator') {
              console.log("Summary received:", data.summary);
              // Open new tab with the summary
              const newTab = window.open('', '_blank');
              if (newTab) {
                newTab.document.write(`
                  <html>
                    <head>
                      <title>Speech Summary</title>
                      <style>
                        body {
                          font-family: Arial, sans-serif;
                          margin: 40px;
                          line-height: 1.6;
                          background-color: #f5f5f5;
                        }
                        .container {
                          max-width: 800px;
                          margin: 0 auto;
                          background: white;
                          padding: 30px;
                          border-radius: 10px;
                          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 {
                          color: #333;
                          border-bottom: 2px solid #eee;
                          padding-bottom: 10px;
                        }
                        p {
                          color: #555;
                          font-size: 18px;
                        }
                      </style>
                    </head>
                    <body>
                      <div class="container">
                        <h1>Speech Summary</h1>
                        <p>${data.summary}</p>
                      </div>
                    </body>
                  </html>
                `);
                newTab.document.close();
              }
            }
          } catch (error) {
            console.error("Error parsing message:", error, event.data);
          }
        };

        ws.current.onclose = () => {
          console.log('WebSocket Disconnected');
          setConnectionStatus('disconnected');
          reconnectInterval.current = setInterval(connect, 3000);
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

  return { ws, transcript, connectionStatus };
};