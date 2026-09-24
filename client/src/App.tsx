import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import PublicOnlyRoute from "./components/PublicOnlyRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireDriverRole from "./components/RequireDriverRole";
import RequireAdminRole from "./components/RequireAdminRole";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DriverLogin from "./pages/DriverLogin";
import DriverRegister from "./pages/DriverRegister";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import DriverOnboarding from "./pages/DriverOnboarding";
import DriverStatus from "./pages/DriverStatus";
import DriverDashboard from "./pages/driver/DriverLayout";
import DriverHome from "./pages/driver/DriverHome";
import DriverRides from "./pages/driver/DriverRides";
import DriverEarnings from "./pages/driver/DriverEarnings";
import DriverProfile from "./pages/driver/DriverProfile";
import AdminDashboard from "./pages/AdminDashboard";

function routeKeyFor(pathname: string) {
  // Keep the driver dashboard shell mounted while navigating between its
  // sub-pages so the app chrome (sidebar) stays put and only the content
  // area transitions.
  if (pathname.startsWith("/driver/dashboard")) return "/driver/dashboard";
  return pathname;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={routeKeyFor(location.pathname)}>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />
        <Route path="/driver/login" element={<DriverLogin />} />
        <Route path="/driver/register" element={<DriverRegister />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/onboarding"
          element={
            <ProtectedRoute>
              <DriverOnboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/status"
          element={
            <ProtectedRoute>
              <DriverStatus />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/dashboard"
          element={
            <ProtectedRoute>
              <RequireDriverRole>
                <DriverDashboard />
              </RequireDriverRole>
            </ProtectedRoute>
          }
        >
          <Route index element={<DriverHome />} />
          <Route path="rides" element={<DriverRides />} />
          <Route path="earnings" element={<DriverEarnings />} />
          <Route path="profile" element={<DriverProfile />} />
          <Route path="*" element={<Navigate to="/driver/dashboard" replace />} />
        </Route>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RequireAdminRole>
                <AdminDashboard />
              </RequireAdminRole>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App