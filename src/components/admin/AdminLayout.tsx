import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Compass,
  LayoutDashboard,
  Gift,
  History,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  Menu,
  X,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  title,
  subtitle,
  actions,
}) => {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { label: 'Overview', to: '/admin', end: true, icon: LayoutDashboard },
    { label: 'Prize Inventory', to: '/admin/inventory', end: false, icon: Gift },
    { label: 'Draw History', to: '/admin/history', end: false, icon: History },
    { label: 'Kiosk Settings', to: '/admin/settings', end: false, icon: SettingsIcon },
  ];

  // Helper to get active page label for mobile header
  const currentNavItem = navItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  return (
    <div className="nel-staff-root min-h-screen bg-[#F8F6FD] text-[#2F2145] flex flex-col font-dm selection:bg-nel-pink selection:text-nel-violet overflow-x-hidden">
      {/* Navigation Header */}
      <header className="bg-white border-b border-[#EAE2F5] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo and Brand */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link to="/admin" className="flex items-center space-x-2 sm:space-x-3 group">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#EEE5FA] border border-[#DBC7F0] flex items-center justify-center text-[#7843A7] shadow-sm group-hover:scale-105 transition shrink-0">
                  <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <span className="font-nel font-semibold text-base sm:text-lg text-[#33224F] group-hover:text-[#8752B2] transition tracking-tight truncate block">
                    NELBD Trail Admin
                  </span>
                  <span className="hidden sm:inline-block text-[11px] px-2 py-0.2 rounded-full bg-[#F4EAF9] border border-[#E5CEEF] text-[#7A429A] font-dm font-bold">
                    Staff Portal
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex space-x-1 lg:space-x-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-dm font-semibold transition ${
                        isActive
                          ? 'bg-[#EEE4FA] text-[#6E369E] border border-[#DCC8F0] shadow-sm'
                          : 'text-[#6E6381] hover:text-[#45246C] hover:bg-[#F4EFFB]'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Right Side: Desktop Kiosk Link, User & Mobile Menu Button */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link
                to="/"
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#F2EAFB] hover:bg-[#E8DAF6] text-[#563276] text-xs font-dm font-bold border border-[#E5D6F2] transition"
                title="Open Public Kiosk View"
              >
                <span>Kiosk Mode</span>
                <ExternalLink className="w-3.5 h-3.5 text-nel-pink" />
              </Link>

              <div className="hidden lg:flex flex-col text-right">
                <span className="text-xs font-semibold text-[#49375F] truncate max-w-[160px]">
                  {user?.displayName || user?.email}
                </span>
                <span className="text-[10px] text-[#8957AC] font-dm font-bold uppercase tracking-wider">
                  Administrator
                </span>
              </div>

              {/* Desktop Sign Out */}
              <button
                onClick={signOut}
                className="hidden sm:flex p-2 rounded-xl bg-[#F7F3FB] hover:bg-red-50 hover:text-red-600 text-[#756587] border border-[#E5DDF0] transition cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Mobile Hamburger / Menu Toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="md:hidden p-2.5 rounded-xl bg-[#F2EAFB] border border-[#E5D6F2] text-[#7C4BA3] hover:text-white transition active:scale-95 cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
                aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-nel-purple/40 bg-white/95 backdrop-blur-md px-3 py-3 animate-in fade-in slide-in-from-top-2 duration-150 shadow-2xl">
            {/* User status in mobile drawer */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-nel-purple/30 px-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-nel-purple/60 border border-nel-pink/40 flex items-center justify-center text-nel-pink shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[180px]">
                    {user?.displayName || user?.email || 'Admin'}
                  </p>
                  <p className="text-[10px] text-nel-pink font-bold uppercase tracking-wider">
                    Staff Portal
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  signOut();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-red-950/60 text-red-300 border border-red-800/60 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-dm font-semibold min-h-[44px] transition ${
                        isActive
                          ? 'bg-nel-purple text-nel-pink border border-nel-pink/50 shadow'
                          : 'text-white/80 hover:text-white hover:bg-nel-purple/30'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0 text-nel-pink" />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Public Kiosk Mode Link in mobile menu */}
            <div className="pt-2 mt-2 border-t border-nel-purple/30">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-nel-purple/20 hover:bg-nel-purple/40 text-nel-pink text-xs font-bold border border-nel-purple/40 min-h-[44px]"
              >
                <span className="flex items-center gap-2">
                  <Compass className="w-4 h-4" />
                  <span>Switch to Public Kiosk Mode</span>
                </span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Mobile Persistent Sub-bar for instant switching between 4 core tabs */}
        <div className="md:hidden border-t border-nel-purple/40 px-1 py-1 flex items-center justify-around bg-[#F6F0FC]">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-dm transition min-h-[44px] min-w-[64px] flex-1 ${
                    isActive
                      ? 'text-nel-pink font-bold bg-nel-purple/40 border border-nel-pink/30'
                      : 'text-white/60 hover:text-white active:bg-nel-purple/20'
                  }`
                }
              >
                <Icon className="w-4 h-4 mb-0.5 shrink-0" />
                <span className="truncate leading-tight">{item.label.split(' ')[0]}</span>
              </NavLink>
            );
          })}
        </div>
      </header>

      {/* Page Title & Action Bar */}
      <section className="bg-[#F1ECFA] border-b border-[#E5DCF2] py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-nel font-semibold tracking-tight text-[#302047] break-words">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs sm:text-sm text-[#756784] mt-1 font-dm break-words leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 sm:space-x-3 shrink-0 pt-1 sm:pt-0">
              {actions}
            </div>
          )}
        </div>
      </section>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {children}
      </main>
    </div>
  );
};
