import { Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Studio from "./pages/Studio";
import Post from "./pages/Post";
import Queue from "./pages/Queue";
import Automations from "./pages/Automations";
import Gallery from "./pages/Gallery";
import Settings from "./pages/Settings";
import { StudioProvider } from "./context/StudioContext";
import { UploadProvider } from "./context/UploadContext";

export default function App() {
  return (
    <UploadProvider>
    <StudioProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="studio" element={<Studio />} />
          <Route path="post" element={<Post />} />
          <Route path="queue" element={<Queue />} />
          <Route path="automations" element={<Automations />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </StudioProvider>
    </UploadProvider>
  );
}
