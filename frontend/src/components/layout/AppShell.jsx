import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import { AutopilotProvider } from '../../context/AutopilotContext';

const AppShell = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AutopilotProvider>
      <div className="flex h-screen bg-surface-50 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopNav onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="p-5 lg:p-8 max-w-[1400px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AutopilotProvider>
  );
};

export default AppShell;
