import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './home';
import Meeting from './meet';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meeting/:roomId" element={<Meeting />} />
      </Routes>
    </Router>
  );
}

export default App;