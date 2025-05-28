import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import styled from 'styled-components';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhone } from 'react-icons/fa';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #202124;
`;

const RoomInfo = styled.div`
  padding: 0.5rem 1rem;
  background: #3c4043;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ParticipantsList = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
  flex-wrap: wrap;

  span {
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    margin: 2px;
  }
`;

const VideoContainer = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
`;

const VideoWrapper = styled.div`
  position: relative;
  background: #3c4043;
  border-radius: 8px;
  overflow: hidden;
  min-height: 200px;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
`;

const UserName = styled.div`
  position: absolute;
  bottom: 8px;
  left: 8px;
  color: white;
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  border-radius: 4px;
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  padding: 1rem;
  background: #3c4043;
  gap: 1rem;
`;

const ControlButton = styled.button`
  background: ${props => props.red ? '#d32f2f' : '#5f6368'};
  color: white;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    background: ${props => props.red ? '#b71c1c' : '#4e5154'};
  }
`;

function Meeting() {
  const { roomId } = useParams();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [currentUsers, setCurrentUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  const socketRef = useRef();
  const peerConnections = useRef({});
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef({});
  const userId = useRef(Date.now().toString(36) + Math.random().toString(36).substring(2));

  const createPeerConnection = (remoteUserId) => {
    if (peerConnections.current[remoteUserId]) {
      return peerConnections.current[remoteUserId];
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    peerConnections.current[remoteUserId] = peerConnection;

    // Add local stream to peer connection if available
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`Received track from ${remoteUserId}`);
      setRemoteStreams(prev => {
        const existingStream = prev.find(stream => stream.userId === remoteUserId);
        if (existingStream) return prev;
        
        return [...prev, { userId: remoteUserId, stream: event.streams[0] }];
      });
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          senderId: userId.current,
          receiverId: remoteUserId,
          candidate: event.candidate,
          roomId
        });
      }
    };

    // Connection state tracking
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      setConnectionStatus(prev => ({
        ...prev,
        [remoteUserId]: state
      }));
      
      if (state === 'disconnected' || state === 'failed') {
        handleUserDisconnected(remoteUserId);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        peerConnection.restartIce();
      }
    };

    return peerConnection;
  };

  const handleUserConnected = async (remoteUserId) => {
    if (remoteUserId === userId.current) return;

    console.log(`New user connected: ${remoteUserId}`);
    setCurrentUsers(prev => [...new Set([...prev, remoteUserId])]);
    
    const peerConnection = createPeerConnection(remoteUserId);

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        senderId: userId.current,
        receiverId: remoteUserId,
        offer,
        roomId
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleOffer = async ({ senderId, offer }) => {
    if (senderId === userId.current) return;

    console.log(`Received offer from ${senderId}`);
    setCurrentUsers(prev => [...new Set([...prev, senderId])]);
    
    const peerConnection = createPeerConnection(senderId);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        senderId: userId.current,
        receiverId: senderId,
        answer,
        roomId
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async ({ senderId, answer }) => {
    console.log(`Received answer from ${senderId}`);
    const peerConnection = peerConnections.current[senderId];
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  };

  const handleIceCandidate = async ({ senderId, candidate }) => {
    const peerConnection = peerConnections.current[senderId];
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  };

  const handleCurrentUsers = (users) => {
    console.log('Current users in room:', users);
    const filteredUsers = users.filter(id => id !== userId.current);
    setCurrentUsers(filteredUsers);
    
    // Create connections to all existing users
    filteredUsers.forEach(existingUserId => {
      if (!peerConnections.current[existingUserId]) {
        handleUserConnected(existingUserId);
      }
    });
  };

  const cleanupDisconnectedUser = (remoteUserId) => {
    console.log(`Cleaning up disconnected user: ${remoteUserId}`);
    
    // Close the peer connection if it exists
    if (peerConnections.current[remoteUserId]) {
      peerConnections.current[remoteUserId].close();
      delete peerConnections.current[remoteUserId];
    }
    
    // Remove from remote streams
    setRemoteStreams(prev => prev.filter(stream => stream.userId !== remoteUserId));
    
    // Remove from current users list
    setCurrentUsers(prev => prev.filter(id => id !== remoteUserId));
    
    // Remove from connection status
    setConnectionStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[remoteUserId];
      return newStatus;
    });
  };

  const handleUserDisconnected = (remoteUserId) => {
    console.log(`Handling disconnection for user: ${remoteUserId}`);
    cleanupDisconnectedUser(remoteUserId);
  };

  useEffect(() => {
    socketRef.current = io('http://localhost:5000');

    // Add beforeunload event listener to notify others when leaving
    const handleBeforeUnload = () => {
      if (socketRef.current.connected) {
        socketRef.current.emit('leave-room', roomId, userId.current);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Join the room
        socketRef.current.emit('join-room', roomId, userId.current);

        // Socket event listeners
        socketRef.current.on('user-connected', handleUserConnected);
        socketRef.current.on('user-disconnected', handleUserDisconnected);
        socketRef.current.on('current-users', handleCurrentUsers);
        socketRef.current.on('offer', handleOffer);
        socketRef.current.on('answer', handleAnswer);
        socketRef.current.on('ice-candidate', handleIceCandidate);
        
        // Add listener for force-disconnect (when server detects a disconnect)
        socketRef.current.on('force-disconnect', (disconnectedUserId) => {
          if (disconnectedUserId !== userId.current) {
            handleUserDisconnected(disconnectedUserId);
          }
        });
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
      });

    return () => {
      // Cleanup function
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Notify server we're leaving if socket is still connected
      if (socketRef.current.connected) {
        socketRef.current.emit('leave-room', roomId, userId.current);
      }
      
      // Close all peer connections
      Object.values(peerConnections.current).forEach(pc => pc.close());
      
      // Disconnect socket
      socketRef.current.disconnect();
      
      // Remove beforeunload listener
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roomId]);

  const leaveCall = () => {
    // Notify server we're leaving
    if (socketRef.current.connected) {
      socketRef.current.emit('leave-room', roomId, userId.current);
    }
    
    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => pc.close());
    
    // Stop local media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Navigate away
    window.location.href = '/';
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Combine all user IDs (current user + remote users)
  const allUserIds = [userId.current, ...currentUsers];

  return (
    <Container>
      <RoomInfo>
        <div>Room ID: {roomId}</div>
        <ParticipantsList>
          <span>{allUserIds.length} participants</span>
          {allUserIds.map(id => (
            <span key={id}>
              {id === userId.current ? 'You' : id} 
              {connectionStatus[id] ? ` (${connectionStatus[id]})` : ''}
            </span>
          ))}
        </ParticipantsList>
      </RoomInfo>
      
      <VideoContainer>
        <VideoWrapper>
          <Video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            style={{ display: isVideoOff ? 'none' : 'block' }}
          />
          {isVideoOff && (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#000',
              color: '#fff'
            }}>
              Camera is off
            </div>
          )}
          <UserName>You ({userId.current})</UserName>
        </VideoWrapper>
        
        {currentUsers.map(remoteUserId => {
          const remoteStream = remoteStreams.find(s => s.userId === remoteUserId);
          return (
            <VideoWrapper key={remoteUserId}>
              {remoteStream ? (
                <Video
                  autoPlay
                  ref={el => {
                    if (el) {
                      remoteVideoRefs.current[remoteUserId] = el;
                      el.srcObject = remoteStream.stream;
                    }
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#000',
                  color: '#fff'
                }}>
                  Connecting...
                </div>
              )}
              <UserName>
                {remoteUserId} ({connectionStatus[remoteUserId] || 'connecting'})
              </UserName>
            </VideoWrapper>
          );
        })}
      </VideoContainer>
      
      <Controls>
        <ControlButton onClick={toggleMute}>
          {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        </ControlButton>
        <ControlButton onClick={toggleVideo}>
          {isVideoOff ? <FaVideoSlash /> : <FaVideo />}
        </ControlButton>
        <ControlButton red onClick={leaveCall}>
          <FaPhone />
        </ControlButton>
      </Controls>
    </Container>
  );
}

export default Meeting;