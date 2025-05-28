import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f5f5f5;
`;

const Card = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 400px;
  text-align: center;
`;

const Button = styled.button`
  background: #1a73e8;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;
  width: 100%;

  &:hover {
    background: #1765cc;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  margin-top: 1rem;
`;

function Home() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoinMeeting = () => {
    if (!roomId.trim()) {
      alert('Please enter a room ID');
      return;
    }
    navigate(`/meeting/${roomId}`);
  };

  const handleNewMeeting = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/meeting/${newRoomId}`);
  };

  return (
    <Container>
      <Card>
        <h1>Meet Clone</h1>
        <Button onClick={handleNewMeeting}>New Meeting</Button>
        <p>or</p>
        <Input
          type="text"
          placeholder="Enter a meeting code"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <Button onClick={handleJoinMeeting}>Join Meeting</Button>
      </Card>
    </Container>
  );
}

export default Home;