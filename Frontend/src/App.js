import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PropertySelector from './components/PropertySelector';
import FormPage from './components/FormPage';
import './styles.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Default route redirects to PropertySelector */}
        <Route path="/" element={<Navigate to="/select-property" />} />
        
        {/* Property selection page */}
        <Route path="/select-property" element={<PropertySelector />} />

        {/* Dynamic route for forms */}
        <Route path="/form/:property" element={<FormPage />} />

        {/* Catch-all for 404 pages */}
        <Route path="*" element={<Navigate to="/select-property" />} />
      </Routes>
    </Router>
  );
}

export default App;
