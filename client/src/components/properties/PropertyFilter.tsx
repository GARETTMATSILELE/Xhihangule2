import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { PropertyFilter as PropertyFilterType, PropertyStatus } from '../../types/property';
import './PropertyFilter.css';

interface PropertyFilterProps {
  filters: PropertyFilterType;
  onFilterChange: (filters: PropertyFilterType) => void;
  onClose: () => void;
}

const propertyStatuses: PropertyStatus[] = ['available', 'rented', 'maintenance'];

export const PropertyFilter: React.FC<PropertyFilterProps> = ({
  filters,
  onFilterChange,
  onClose
}) => {
  const handleStatusChange = (status: 'all' | PropertyStatus) => {
    onFilterChange({
      ...filters,
      status
    });
  };

  const handleLocationChange = (location: string) => {
    onFilterChange({
      ...filters,
      location
    });
  };

  const handleRentRangeChange = (min: number, max: number) => {
    onFilterChange({
      ...filters,
      rentRange: { min, max }
    });
  };

  const handleReset = () => {
    onFilterChange({
      status: 'all',
      location: '',
      rentRange: { min: 0, max: 10000 }
    });
  };

  return (
    <div className="property-filter-overlay">
      <div className="property-filter">
        <div className="filter-header">
          <h2>Filter Properties</h2>
          <button className="close-button" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="filter-content">
          <div className="filter-group">
            <label>Status</label>
            <div className="status-buttons">
              <button
                className={`status-button ${filters.status === 'all' ? 'active' : ''}`}
                onClick={() => handleStatusChange('all')}
              >
                All
              </button>
              {propertyStatuses.map(status => (
                <button
                  key={status}
                  className={`status-button ${filters.status === status ? 'active' : ''}`}
                  onClick={() => handleStatusChange(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              value={filters.location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Enter location"
            />
          </div>

          <div className="filter-group">
            <label>Rent Range</label>
            <div className="rent-range">
              <input
                type="number"
                value={filters.rentRange.min}
                onChange={(e) => handleRentRangeChange(Number(e.target.value), filters.rentRange.max)}
                placeholder="Min"
                min="0"
              />
              <span>to</span>
              <input
                type="number"
                value={filters.rentRange.max}
                onChange={(e) => handleRentRangeChange(filters.rentRange.min, Number(e.target.value))}
                placeholder="Max"
                min="0"
              />
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button className="reset-button" onClick={handleReset}>
            Reset Filters
          </button>
          <button className="apply-button" onClick={onClose}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}; 