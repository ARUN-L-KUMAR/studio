import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Backdrop from "./Backdrop";
import Dock from "./Dock";
import Topbar from "./Topbar";
import UploadTray from "../vault/UploadTray";

export default function AppShell() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <Backdrop />
      <Topbar />
      <main className="w-full max-w-[1360px] mx-auto px-4 sm:px-8 pt-2 pb-32 sm:pb-44">
        {/* Pure CSS enter animation: always ends visible, even if JS animation frames are throttled */}
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
      <Dock />
      <UploadTray />
    </div>
  );
}
