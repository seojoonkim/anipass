import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { userService } from '../../services/userService';
import { notificationService } from '../../services/notificationService';
import { getCurrentLevelInfo } from '../../utils/otakuLevels';
import NotificationDropdown from './NotificationDropdown';
import DefaultAvatar from './DefaultAvatar';
import { API_BASE_URL, IMAGE_BASE_URL } from '../../config/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);
  const mobileUserMenuRef = useRef(null);

  // Initialize from localStorage cache to prevent flickering
  const [otakuScore, setOtakuScore] = useState(() => {
    const cached = localStorage.getItem('cached_otaku_score');
    return cached ? (parseFloat(cached) || 0) : 0;
  });

  // Update otakuScore immediately when user changes (from cache or user object)
  useEffect(() => {
    if (user) {
      const cached = localStorage.getItem('cached_otaku_score');
      if (cached) {
        setOtakuScore(parseFloat(cached) || 0);
      } else if (user.otaku_score !== undefined) {
        setOtakuScore(user.otaku_score || 0);
      }
    }
  }, [user]);

  // Listen for storage changes to update otaku_score in real-time
  useEffect(() => {
    const handleStorageChange = () => {
      if (user) {
        const cached = localStorage.getItem('cached_otaku_score');
        if (cached) {
          setOtakuScore(parseFloat(cached) || 0);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user]);

  // Fetch otaku_score from server in background and update cache
  useEffect(() => {
    const fetchOtakuScore = async () => {
      if (user) {
        try {
          const stats = await userService.getStats();
          const score = stats.otaku_score || 0;
          setOtakuScore(score);
          // Update cache for next time
          localStorage.setItem('cached_otaku_score', score.toString());
        } catch (err) {
          console.error('[Navbar] Failed to fetch otaku_score:', err);
          // Fallback to user.otaku_score if API fails
          const fallbackScore = user.otaku_score || 0;
          setOtakuScore(fallbackScore);
          localStorage.setItem('cached_otaku_score', fallbackScore.toString());
        }
      }
    };

    fetchOtakuScore();
  }, [user]);

  const toRoman = (num) => {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanNumerals[num - 1] || num;
  };

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target) &&
        mobileUserMenuRef.current && !mobileUserMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showNotificationDropdown || showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotificationDropdown, showUserMenu]);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (user) {
        try {
          const count = await notificationService.getUnreadCount();
          setUnreadCount(count);
        } catch (err) {
          console.error('Failed to fetch unread count:', err);
        }
      }
    };

    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const isActive = (path) => {
    return location.pathname === path || (path === '/rate' && location.pathname === '/');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setShowUserMenu(false);
  };

  const handleSettings = () => {
    navigate('/settings');
    setShowUserMenu(false);
  };

  const handleNotificationClick = (e) => {
    e.stopPropagation();
    setShowNotificationDropdown(!showNotificationDropdown);
    // 다른 메뉴 닫기
    setShowUserMenu(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setUnreadCount(0);
      // 현재 시간을 lastCheckTime으로 설정
      setLastCheckTime(new Date().toISOString());
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleMyAnipass = () => {
    navigate('/my-anipass');
    setShowUserMenu(false);
  };

  const getAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return null;
    // 외부 URL은 그대로 사용
    if (avatarUrl.startsWith('http')) return avatarUrl;
    // /uploads로 시작하면 API 서버 (파일 업로드)
    if (avatarUrl.startsWith('/uploads')) {
      return `${import.meta.env.VITE_API_URL || API_BASE_URL}${avatarUrl}`;
    }
    // 그 외는 IMAGE_BASE_URL (R2, 캐릭터 이미지)
    return `${IMAGE_BASE_URL}${avatarUrl}`;
  };

  const menuItems = [
    {
      path: '/feed',
      labelKo: '피드',
      labelEn: 'Feed',
      labelJa: 'フィード',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    },
    {
      path: '/rate',
      label: t('rate'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      )
    },
    {
      path: '/rate-characters',
      label: t('rateCharacter'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      path: '/write-reviews',
      label: t('writeReview'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )
    },
    {
      path: '/browse',
      label: t('browse'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    },
    {
      path: '/leaderboard',
      labelKo: '리더보드',
      labelEn: 'Leaderboard',
      labelJa: 'ランキング',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
  ];

  return (
    <>
      {/* Desktop & Mobile Top Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-10 md:h-12 bg-surface"
        style={{
          borderBottom: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div className="max-w-[1180px] mx-auto px-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 items-center h-9 md:h-12 md:gap-4 pb-1 md:pb-0">
            {/* Logo and Mobile User Menu */}
            <div className="flex items-center justify-between md:col-span-1">
              <Link to="/feed" className="flex items-center gap-1.5 md:gap-2 hover:opacity-80 transition-opacity group">
                {/* Logo Icon */}
                <div className="w-6 h-6 md:w-7 md:h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-sm md:text-base" style={{ fontFamily: "'Inter', sans-serif" }}>A</span>
                </div>
                <span
                  className="text-lg md:text-xl font-semibold tracking-tight text-white"
                  style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}
                >
                  Anibite
                </span>
              </Link>

              {/* Mobile User Menu - Only visible on mobile */}
              {user && (
                <div className="md:hidden relative" ref={mobileUserMenuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="text-text-primary hover:bg-surface-hover text-sm font-medium px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-1.5"
                  >
                    {user.avatar_url ? (
                      <img
                        src={getAvatarUrl(user.avatar_url)}
                        alt={user.display_name || user.username}
                        className="w-8 h-8 rounded-full object-cover border border-border"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <DefaultAvatar
                        username={user.username}
                        displayName={user.display_name}
                        size="sm"
                        className="w-8 h-8"
                      />
                    )}
                    <span className="text-sm font-medium max-w-[80px] truncate">{user.display_name || user.username}</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-52 bg-surface rounded-md shadow-lg z-50 border border-border">
                      <button
                        onClick={handleMyAnipass}
                        className="block w-full text-left px-4 py-3 text-sm font-medium rounded-t-md transition-colors bg-surface-elevated text-text-primary border-b border-border hover:bg-surface-hover"
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <span>{language === 'ko' ? '내 애니바이트' : language === 'ja' ? 'マイAniBite' : 'My AniBite'}</span>
                        </div>
                      </button>
                      <button
                        onClick={handleSettings}
                        className="block w-full text-left px-4 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{language === 'ko' ? '설정' : language === 'ja' ? '設定' : 'Settings'}</span>
                        </div>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-error hover:bg-surface-hover rounded-b-md transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span>{language === 'ko' ? '로그아웃' : language === 'ja' ? 'ログアウト' : 'Logout'}</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desktop Menu and Right Side - Aligned with feed content area */}
            <div className="hidden md:flex items-center justify-between md:col-span-3">
              <div className="flex items-center space-x-0.5 lg:space-x-1">
                {menuItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-2 lg:px-3 py-1.5 rounded-md text-xs font-normal transition-colors whitespace-nowrap ${isActive(item.path)
                      ? 'bg-primary text-white'
                      : 'text-text-primary hover:text-text-secondary hover:bg-surface-hover'
                      }`}
                  >
                    {item.labelKo ? (language === 'ko' ? item.labelKo : language === 'ja' ? item.labelJa : item.labelEn) : item.label}
                  </Link>
                ))}
              </div>

              {/* Right Side - User */}
              <div className="flex items-center space-x-2">
                {/* Notification Bell */}
                {user && (
                  <div className="relative" ref={notificationRef}>
                    <button
                      onClick={handleNotificationClick}
                      className={`relative text-text-primary hover:bg-surface-hover p-2 rounded-md transition-colors flex items-center ${showNotificationDropdown ? 'bg-surface-hover' : ''
                        }`}
                      style={{ minWidth: '40px' }}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-error text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 animate-pulse">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Notification Dropdown */}
                    <NotificationDropdown
                      isOpen={showNotificationDropdown}
                      onClose={() => setShowNotificationDropdown(false)}
                      unreadCount={unreadCount}
                      onMarkAllRead={handleMarkAllRead}
                      lastCheckTime={lastCheckTime}
                    />
                  </div>
                )}

                {user && (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="text-text-primary hover:text-text-secondary hover:bg-surface-hover text-sm font-medium px-3 py-2 rounded-md transition-colors flex items-center gap-2"
                      style={{ minWidth: '160px' }}
                    >
                      {user.avatar_url ? (
                        <img
                          src={getAvatarUrl(user.avatar_url)}
                          alt={user.display_name || user.username}
                          className="w-8 h-8 rounded-full object-cover border border-border"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <DefaultAvatar
                          username={user.username}
                          displayName={user.display_name}
                          size="sm"
                          className="w-8 h-8"
                        />
                      )}
                      <span className="text-sm font-medium">{user.display_name || user.username}</span>
                      {(() => {
                        const levelInfo = getCurrentLevelInfo(otakuScore, language);
                        return (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold hidden sm:inline-flex"
                            style={{ backgroundColor: levelInfo.bgColor, border: `1px solid ${levelInfo.borderColorHex}` }}
                          >
                            <span style={{ color: levelInfo.color }} className="font-bold">{levelInfo.icon}</span>
                            <span style={{ color: levelInfo.color }}>{levelInfo.level} - {toRoman(levelInfo.rank)}</span>
                          </span>
                        );
                      })()}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-52 bg-surface rounded-md shadow-lg z-50 border border-border">
                        <button
                          onClick={handleMyAnipass}
                          className="block w-full text-left px-4 py-3 text-sm font-medium rounded-t-md transition-colors bg-surface-elevated text-text-primary border-b border-border hover:bg-surface-hover"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <span>{language === 'ko' ? '내 애니바이트' : language === 'ja' ? 'マイAniBite' : 'My AniBite'}</span>
                          </div>
                        </button>
                        <button
                          onClick={handleSettings}
                          className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{language === 'ko' ? '설정' : language === 'ja' ? '設定' : 'Settings'}</span>
                          </div>
                        </button>
                        <button
                          onClick={handleLogout}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-md transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>{language === 'ko' ? '로그아웃' : language === 'ja' ? 'ログアウト' : 'Logout'}</span>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation - Only visible on mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-lg z-50">
        <div className="grid grid-cols-6 h-14">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors py-1 ${isActive(item.path)
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              <div className="scale-90">{item.icon}</div>
              <span className="text-[9px] font-medium">
                {item.labelKo ? (language === 'ko' ? item.labelKo : language === 'ja' ? item.labelJa : item.labelEn) : item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-14" />
    </>
  );
}
