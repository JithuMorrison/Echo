import React, { useRef, useEffect } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

function Meet() {
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerConnection = useRef(null);

  useEffect(() => {
    const startMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.current.srcObject = stream;

      peerConnection.current = new RTCPeerConnection();

      stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", event.candidate);
        }
      };

      peerConnection.current.ontrack = (event) => {
        remoteVideo.current.srcObject = event.streams[0];
      };

      socket.on("offer", async (offer) => {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("answer", answer);
      });

      socket.on("answer", async (answer) => {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on("ice-candidate", async (candidate) => {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      });
    };

    startMedia();
  }, []);

  const createOffer = async () => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit("offer", offer);
  };

  return (
    <div>
      <video ref={localVideo} autoPlay muted playsInline width={300} />
      <video ref={remoteVideo} autoPlay playsInline width={300} />
      <button onClick={createOffer}>Start Call</button>
    </div>
  );
}

export default Meet;
