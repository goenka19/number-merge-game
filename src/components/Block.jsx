import React from 'react';

// Color palette for different values (minimal, dark mode friendly)
const getBlockColor = (value) => {
  const colors = {
    2: '#3b3b4f',
    4: '#4a4a5e',
    8: '#5a5a6e',
    16: '#6b5a7e',
    32: '#7b5a8e',
    64: '#8b5a7e',
    128: '#5a7b8e',
    256: '#5a8b7e',
    512: '#7e8b5a',
    1024: '#8e7b5a',
    2048: '#9e6b5a',
    4096: '#ae5b5a',
    8192: '#be4b5a',
  };
  return colors[value] || '#ce3b4a';
};

const getTextColor = (value) => {
  return value >= 8 ? '#f0f0f0' : '#e0e0e0';
};

const getFontSize = (value) => {
  if (value >= 1024) return '14px';
  if (value >= 128) return '16px';
  return '20px';
};

const Block = ({ value, isDropping, style }) => {
  if (value === null) return null;

  return (
    <div
      className={`block ${isDropping ? 'dropping' : ''}`}
      style={{
        backgroundColor: getBlockColor(value),
        color: getTextColor(value),
        fontSize: getFontSize(value),
        ...style,
      }}
    >
      {value}
    </div>
  );
};

export default Block;
