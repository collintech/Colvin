import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App.jsx';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import './styles/global.css';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 }, mutations: { retry: 0 } },
});
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
