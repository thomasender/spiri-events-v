import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import App from './App.jsx';
import './styles/tokens.css';
import './index.css';
import { initLayoutFromCache } from './lib/layoutStore';

// Paint the cached layout tokens before React renders, so a returning visitor
// never sees the default spacing flash and jump.
initLayoutFromCache();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
