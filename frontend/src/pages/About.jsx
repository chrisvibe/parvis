import React, { useState, useEffect } from 'react';
import HallOfFame from '../components/HallOfFame';

function About() {
  const [content, setContent] = useState('');

  useEffect(() => {
    fetch('/about.txt')
      .then(response => response.text())
      .then(text => setContent(text))
      .catch(error => {
        console.error('Error loading about.txt:', error);
        setContent('# About\n\nError loading content.');
      });
  }, []);

  // Simple markdown-like rendering
  const renderContent = (text) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx}>{line.substring(2)}</h1>;
      } else if (line.startsWith('## ')) {
        return <h2 key={idx}>{line.substring(3)}</h2>;
      } else if (line.startsWith('### ')) {
        return <h3 key={idx}>{line.substring(4)}</h3>;
      } else if (line.startsWith('- ')) {
        return <li key={idx}>{line.substring(2)}</li>;
      } else if (line.trim() === '') {
        return <br key={idx} />;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={idx}><strong>{line.slice(2, -2)}</strong></p>;
      } else {
        return <p key={idx}>{line}</p>;
      }
    });
  };

  return (
    <div className="page">
      {/* Two columns on a wide screen, stacked on a narrow one — the hall of
          fame reads as a sidebar to the text, not as a separate page. */}
      <div className="about-layout">
        <div className="about-content">
          {renderContent(content)}
        </div>

        <HallOfFame />
      </div>
    </div>
  );
}

export default About;
