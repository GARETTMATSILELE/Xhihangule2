import React from 'react';
import './Home.css';

const Home: React.FC = () => {
  return (
    <div className="home">
      <h1>Welcome to Xhihangule2</h1>
      <p>This is your starting point for building something amazing!</p>
      <div className="features">
        <div className="feature-card">
          <h3>Feature 1</h3>
          <p>Description of your first amazing feature.</p>
        </div>
        <div className="feature-card">
          <h3>Feature 2</h3>
          <p>Description of your second amazing feature.</p>
        </div>
        <div className="feature-card">
          <h3>Feature 3</h3>
          <p>Description of your third amazing feature.</p>
        </div>
      </div>
    </div>
  );
};

export default Home; 