import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { AppProvider } from "./context/AppContext";
import { AuthGate, AuthProvider } from "./context/AuthContext";
import "swiper/css";
import "swiper/css/pagination";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <MotionConfig reducedMotion="user">
            <AuthProvider>
              <AuthGate>
                {/* the app (and its data) only loads once the visitor is signed in */}
                <AppProvider>
                  <BrowserRouter>
                    <App />
                  </BrowserRouter>
                </AppProvider>
              </AuthGate>
            </AuthProvider>
          </MotionConfig>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
