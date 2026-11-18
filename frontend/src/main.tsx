import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { RobotProvider } from './state/RobotContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RobotProvider>
        <App />
      </RobotProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
