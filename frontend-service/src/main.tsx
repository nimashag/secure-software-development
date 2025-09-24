import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { CartProvider } from './contexts/CartContext';
import { GoogleOAuthProvider } from '@react-oauth/google';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <CartProvider>
        <App />
      </CartProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
