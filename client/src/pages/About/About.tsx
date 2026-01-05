import React from 'react';
import './About.css';

const About: React.FC = () => {
  return (
    <div className="about">
      <h1>About Mantis Africa</h1>
      <p>
        Welcome to Mantis Africa, a modern property management application designed to help you
        manage your properties efficiently and effectively.
      </p>
      <div className="features">
        <div className="feature">
          <h3>Property Management</h3>
          <p>Easily manage your properties, units, and maintenance requests.</p>
        </div>
        <div className="feature">
          <h3>Tenant Portal</h3>
          <p>Provide your tenants with a convenient way to pay rent and submit requests.</p>
        </div>
        <div className="feature">
          <h3>Financial Tracking</h3>
          <p>Keep track of income, expenses, and generate financial reports.</p>
        </div>
      </div>
    </div>
  );
};

export default About; 