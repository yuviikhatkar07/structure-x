import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import Dashboard from './pages/Dashboard';
import CameraPage from './pages/CameraPage';
import ControlPage from './pages/ControlPage';
import ClimbingPage from './pages/ClimbingPage';
import EnvironmentPage from './pages/EnvironmentPage';
import RiskPage from './pages/RiskPage';
import MissionsPage from './pages/MissionsPage';
import HistoryPage from './pages/HistoryPage';
import EventsPage from './pages/EventsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/camera" element={<CameraPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/environment" element={<EnvironmentPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
