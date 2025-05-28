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

  span {
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
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
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
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

    // Add local stream to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      setRemoteStreams(prev => {
        // Check if we already have this stream
        const existingIndex = prev.findIndex(stream => stream.userId === remoteUserId);
        
        if (existingIndex >= 0) {
          // Update existing stream
          const updated = [...prev];
          updated[existingIndex] = { userId: remoteUserId, stream: event.streams[0] };
          return updated;
        } else {
          // Add new stream
          return [...prev, { userId: remoteUserId, stream: event.streams[0] }];
        }
      });

      // Set the stream to the video element
      if (remoteVideoRefs.current[remoteUserId]) {
        remoteVideoRefs.current[remoteUserId].srcObject = event.streams[0];
      }
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', userId.current, event.candidate, roomId);
      }
    };

    // Connection state tracking
    peerConnection.onconnectionstatechange = () => {
      setConnectionStatus(prev => ({
        ...prev,
        [remoteUserId]: peerConnection.connectionState
      }));
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        console.log(`ICE failed with ${remoteUserId}, attempting restart...`);
        peerConnection.restartIce();
      }
    };

    return peerConnection;
  };

  const handleUserConnected = async (remoteUserId) => {
    if (remoteUserId === userId.current) return;

    console.log(`New user connected: ${remoteUserId}`);
    const peerConnection = createPeerConnection(remoteUserId);

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socketRef.current.emit('offer', userId.current, offer, roomId);
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleUserDisconnected = (remoteUserId) => {
    console.log(`User disconnected: ${remoteUserId}`);
    if (peerConnections.current[remoteUserId]) {
      peerConnections.current[remoteUserId].close();
      delete peerConnections.current[remoteUserId];
    }
    
    setRemoteStreams(prev => prev.filter(stream => stream.userId !== remoteUserId));
    setCurrentUsers(prev => prev.filter(id => id !== remoteUserId));
    
    setConnectionStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[remoteUserId];
      return newStatus;
    });
  };

  const handleOffer = async (remoteUserId, offer) => {
    if (remoteUserId === userId.current) return;

    console.log(`Received offer from ${remoteUserId}`);
    const peerConnection = createPeerConnection(remoteUserId);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socketRef.current.emit('answer', userId.current, answer, roomId);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (remoteUserId, answer) => {
    console.log(`Received answer from ${remoteUserId}`);
    const peerConnection = peerConnections.current[remoteUserId];
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  };

  const handleIceCandidate = async (remoteUserId, candidate) => {
    const peerConnection = peerConnections.current[remoteUserId];
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
    setCurrentUsers(users);
    
    // Create connections to all existing users
    users.forEach(existingUserId => {
      if (existingUserId !== userId.current) {
        handleUserConnected(existingUserId);
      }
    });
  };

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:5000');

    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Join the room
        socketRef.current.emit('join-room', roomId, userId.current);

        // Setup socket listeners
        socketRef.current.on('user-connected', handleUserConnected);
        socketRef.current.on('user-disconnected', handleUserDisconnected);
        socketRef.current.on('current-users', handleCurrentUsers);
        socketRef.current.on('offer', handleOffer);
        socketRef.current.on('answer', handleAnswer);
        socketRef.current.on('ice-candidate', handleIceCandidate);
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
      });

    return () => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      socketRef.current.disconnect();
      Object.values(peerConnections.current).forEach(pc => pc.close());
    };
  }, [roomId]);

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

  const leaveCall = () => {
    window.location.href = '/';
  };

  return (
    <Container>
      <RoomInfo>
        <div>Room ID: {roomId}</div>
        <ParticipantsList>
          <span>{currentUsers.length + 1} participants</span>
          <div>Connected Users: {[userId.current, ...currentUsers].map(id => 
            <span key={id}>{id}</span>
          )}</div>
        </ParticipantsList>
      </RoomInfo>
      
      <VideoContainer>
        <VideoWrapper>
          <Video ref={localVideoRef} autoPlay muted />
          <UserName>You ({userId.current})</UserName>
        </VideoWrapper>
        
        {remoteStreams.map(({ userId: remoteUserId, stream }) => (
          <VideoWrapper key={remoteUserId}>
            <Video
              autoPlay
              ref={el => {
                remoteVideoRefs.current[remoteUserId] = el;
                if (el) el.srcObject = stream;
              }}
            />
            <UserName>
              {remoteUserId} ({connectionStatus[remoteUserId] || 'connecting'})
            </UserName>
          </VideoWrapper>
        ))}
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