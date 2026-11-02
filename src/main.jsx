import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import App from './App.jsx';
import './styles/tokens.css';
import './index.css';
import { initLayoutFromCache } from './lib/layoutStore';

// Paint the cached layout tokens before React renders, so a returning visitor
// never sees the default spacing flash and jump.
initLayoutFromCache();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
