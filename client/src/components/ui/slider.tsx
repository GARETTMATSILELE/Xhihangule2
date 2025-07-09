import React from 'react';
import { Slider as MuiSlider, SliderProps } from '@mui/material';

export const Slider: React.FC<SliderProps> = (props) => <MuiSlider {...props} />;

export default Slider; 