import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import styled from 'styled-components';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhone, FaExpand } from 'react-icons/fa';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #202124;
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
  const socketRef = useRef();
  const peerConnections = useRef({});
  const localVideoRef = useRef();
  const userId = useRef(Date.now().toString(36) + Math.random().toString(36).substring(2));

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('https://echoconnectapi-production.up.railway.app/');

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
        socketRef.current.on('current-users', setCurrentUsers);
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

  const handleUserConnected = (remoteUserId) => {
    if (remoteUserId === userId.current) return;

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    peerConnections.current[remoteUserId] = peerConnection;

    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      setRemoteStreams(prev => {
        if (!prev.some(stream => stream.userId === remoteUserId)) {
          return [...prev, { userId: remoteUserId, stream: event.streams[0] }];
        }
        return prev;
      });
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', userId.current, event.candidate, roomId);
      }
    };

    // Create offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        socketRef.current.emit('offer', userId.current, peerConnection.localDescription, roomId);
      });
  };

  const handleUserDisconnected = (remoteUserId) => {
    if (peerConnections.current[remoteUserId]) {
      peerConnections.current[remoteUserId].close();
      delete peerConnections.current[remoteUserId];
    }
    setRemoteStreams(prev => prev.filter(stream => stream.userId !== remoteUserId));
    setCurrentUsers(prev => prev.filter(id => id !== remoteUserId));
  };

  const handleOffer = async (remoteUserId, offer) => {
    if (remoteUserId === userId.current) return;

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    peerConnections.current[remoteUserId] = peerConnection;

    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      setRemoteStreams(prev => {
        if (!prev.some(stream => stream.userId === remoteUserId)) {
          return [...prev, { userId: remoteUserId, stream: event.streams[0] }];
        }
        return prev;
      });
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', userId.current, event.candidate, roomId);
      }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socketRef.current.emit('answer', userId.current, peerConnection.localDescription, roomId);
  };

  const handleAnswer = async (remoteUserId, answer) => {
    const peerConnection = peerConnections.current[remoteUserId];
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (remoteUserId, candidate) => {
    const peerConnection = peerConnections.current[remoteUserId];
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    }
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

  const leaveCall = () => {
    window.location.href = '/';
  };

  return (
    <Container>
      <VideoContainer>
        <VideoWrapper>
          <Video ref={localVideoRef} autoPlay muted />
          <UserName>You ({userId.current})</UserName>
        </VideoWrapper>
        {remoteStreams.map(({ userId: remoteUserId, stream }) => (
          <VideoWrapper key={remoteUserId}>
            <Video
              autoPlay
              ref={video => {
                if (video && video.srcObject !== stream) {
                  video.srcObject = stream;
                }
              }}
            />
            <UserName>{remoteUserId}</UserName>
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