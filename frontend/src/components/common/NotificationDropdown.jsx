import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationService } from '../../services/notificationService';
import { useLanguage } from '../../context/LanguageContext';
import { API_BASE_URL, IMAGE_BASE_URL } from '../../config/api';

export default function NotificationDropdown({
  isOpen,
  onClose,
  unreadCount,
  onMarkAllRead,
  lastCheckTime
}) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const notificationRefs = useRef([]);

  // 알림 로드
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationService.getRecentNotifications(20); // 더 많이 가져와서 그룹화

      // 알림 그룹화: 같은 activity_type + item_id + actor_user_id 조합은 하나로
      const groupedNotifications = [];
      const seen = new Set();

      (data.items || []).forEach(notification => {
        // 고유 키 생성
        const key = `${notification.activity_type}_${notification.item_id}_${notification.actor_user_id}`;

        if (!seen.has(key)) {
          seen.add(key);
          groupedNotifications.push(notification);
        }
      });

      // 최대 5개만 표시
      setNotifications(groupedNotifications.slice(0, 5));
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // 알림 타입별 아이콘
  const getNotificationIcon = (notification) => {
    if (notification.type === 'like') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      );
    } else if (notification.type === 'comment') {
      return (
        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      );
    } else if (notification.type === 'follow') {
      return (
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
      );
    } else {
      return (
        <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
      );
    }
  };

  // 알림 텍스트 생성
  const getNotificationText = (notification) => {
    const displayName = notification.actor_display_name || notification.actor_username;

    if (notification.type === 'like') {
      return language === 'ko'
        ? `${displayName}님이 회원님의 평가에 좋아요를 눌렀어요`
        : language === 'ja'
        ? `${displayName}さんがあなたの評価にいいねしました`
        : `${displayName} liked your rating`;
    } else if (notification.type === 'comment') {
      const commentText = notification.comment_text || notification.comment_content || '';
      const preview = commentText
        ? (commentText.length > 30
          ? commentText.substring(0, 30) + '...'
          : commentText)
        : '';
      return language === 'ko'
        ? `${displayName}님이 댓글을 남겼어요${preview ? `: "${preview}"` : ''}`
        : language === 'ja'
        ? `${displayName}さんがコメントしました${preview ? `: "${preview}"` : ''}`
        : `${displayName} commented${preview ? `: "${preview}"` : ''}`;
    } else if (notification.type === 'follow') {
      return language === 'ko'
        ? `${displayName}님이 회원님을 팔로우하기 시작했어요`
        : language === 'ja'
        ? `${displayName}さんがあなたをフォローしました`
        : `${displayName} started following you`;
    }
    return '';
  };

  // 상대 시간 표시
  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const notificationTime = new Date(timestamp.endsWith('Z') ? timestamp : timestamp + 'Z');
    const diff = now - notificationTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (language === 'ko') {
      if (minutes < 1) return '방금';
      if (minutes < 60) return `${minutes}분 전`;
      if (hours < 24) return `${hours}시간 전`;
      if (days < 7) return `${days}일 전`;
      return notificationTime.toLocaleDateString('ko-KR');
    } else if (language === 'ja') {
      if (minutes < 1) return 'たった今';
      if (minutes < 60) return `${minutes}分前`;
      if (hours < 24) return `${hours}時間前`;
      if (days < 7) return `${days}日前`;
      return notificationTime.toLocaleDateString('ja-JP');
    } else {
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return notificationTime.toLocaleDateString('en-US');
    }
  };

  // 알림이 읽지 않은 것인지 확인
  const isUnread = (notification) => {
    if (!lastCheckTime) return true;
    const notificationTime = new Date(notification.time.endsWith('Z') ? notification.time : notification.time + 'Z');
    const checkTime = new Date(lastCheckTime.endsWith('Z') ? lastCheckTime : lastCheckTime + 'Z');
    return notificationTime > checkTime;
  };

  // 이미지 URL 생성
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '/placeholder-anime.svg';
    if (imageUrl.startsWith('http')) return imageUrl;
    // Use covers_large for better quality
    const processedUrl = imageUrl.includes('/covers/')
      ? imageUrl.replace('/covers/', '/covers_large/')
      : imageUrl;
    return `${IMAGE_BASE_URL}${processedUrl}`;
  };

  const getAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return '/placeholder-avatar.png';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `${import.meta.env.VITE_API_URL || API_BASE_URL}${avatarUrl}`;
  };

  // 알림 클릭 (피드 알림 페이지의 해당 활동으로 이동)
  const handleNotificationClick = (notification) => {
    const activityType = notification.activity_type;
    const userId = notification.target_user_id;
    const itemId = notification.item_id;

    // 활동 키 생성 (Feed에서 사용하는 형식과 동일)
    const activityKey = `${activityType}_${userId}_${itemId}`;

    // 피드 알림 페이지로 이동 + 해당 활동 하이라이트
    navigate(`/feed?filter=notifications&highlight=${activityKey}`);

    onClose();
  };

  // 모두 읽음 처리
  const handleMarkAllRead = async () => {
    await onMarkAllRead();
    // 드롭다운은 열린 상태 유지
  };

  // 모두 보기
  const handleViewAll = async () => {
    await onMarkAllRead();
    navigate('/feed?filter=notifications');
    onClose();
  };

  // 키보드 네비게이션
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev + 1;
          return next < notifications.length ? next : prev;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev - 1;
          return next >= 0 ? next : -1;
        });
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleNotificationClick(notifications[selectedIndex]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, notifications, selectedIndex]);

  // 선택된 알림으로 스크롤
  useEffect(() => {
    if (selectedIndex >= 0 && notificationRefs.current[selectedIndex]) {
      notificationRefs.current[selectedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <>
      {/* Desktop Dropdown */}
      <div
        ref={dropdownRef}
        className="hidden md:block absolute right-0 mt-2 w-96 bg-surface rounded-lg shadow-2xl border border-border z-50 overflow-hidden transition-all duration-200 ease-out opacity-100 translate-y-0"
        style={{
          maxHeight: '500px',
          animation: 'slideDown 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/80 to-secondary/80">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            {language === 'ko' ? '알림' : language === 'ja' ? '通知' : 'Notifications'}
            {unreadCount > 0 && (
              <span className="bg-secondary text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </h3>
          {notifications.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-white text-xs hover:underline font-medium"
            >
              {language === 'ko' ? '모두 읽음' : language === 'ja' ? 'すべて既読' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="p-8 text-center text-text-secondary">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              {language === 'ko' ? '로딩 중...' : language === 'ja' ? '読み込み中...' : 'Loading...'}
            </div>
          ) : (notifications.length === 0 || unreadCount === 0) ? (
            // 빈 상태
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-text-tertiary mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <p className="text-text-secondary font-medium">
                {language === 'ko' ? '새로운 알림이 없습니다' : language === 'ja' ? '新しい通知はありません' : 'No new notifications'}
              </p>
            </div>
          ) : (
            // 알림 목록
            notifications.map((notification, index) => (
              <button
                key={`${notification.type}-${notification.actor_user_id}-${notification.time}-${index}`}
                ref={el => notificationRefs.current[index] = el}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full px-4 py-3 flex gap-3 hover:bg-surface-hover transition-colors border-b border-border text-left ${
                  selectedIndex === index ? 'bg-primary/10' : ''
                }`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 relative">
                  <img
                    src={getAvatarUrl(notification.actor_avatar_url)}
                    alt={notification.actor_display_name || notification.actor_username}
                    className="w-10 h-10 rounded-full object-cover border border-border"
                  />
                  {/* Icon Badge */}
                  <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-0.5">
                    {getNotificationIcon(notification)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary mb-1 line-clamp-2">
                    {getNotificationText(notification)}
                  </p>
                  {notification.item_title && (
                    <p className="text-xs text-text-secondary mb-1">
                      {language === 'ko' && notification.item_title_korean
                        ? notification.item_title_korean
                        : notification.item_title}
                    </p>
                  )}
                  <p className="text-xs text-text-tertiary">
                    {getTimeAgo(notification.time)}
                  </p>
                </div>

                {/* Thumbnail */}
                {notification.item_image && (
                  <div className="flex-shrink-0">
                    <img
                      src={getImageUrl(notification.item_image)}
                      alt=""
                      className="w-12 h-16 object-cover rounded border border-border"
                    />
                  </div>
                )}

                {/* Unread indicator */}
                {isUnread(notification) && (
                  <div className="flex-shrink-0 self-center">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-border bg-surface-elevated">
            <button
              onClick={handleViewAll}
              className="w-full py-3 text-center text-primary hover:text-primary-light font-medium text-sm transition-colors"
            >
              {language === 'ko' ? '알림 모두보기 →' : language === 'ja' ? 'すべての通知を見る →' : 'View all notifications →'}
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet */}
      <div className="md:hidden">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-200"
          style={{ animation: 'fadeIn 0.2s ease-out' }}
          onClick={onClose}
        />

        {/* Bottom Sheet */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-2xl z-50 transition-transform duration-300 border-t border-border"
          style={{
            maxHeight: '70vh',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1 bg-text-tertiary rounded-full"></div>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-text-primary font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              {language === 'ko' ? '알림' : language === 'ja' ? '通知' : 'Notifications'}
              {unreadCount > 0 && (
                <span className="bg-secondary text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-primary text-sm hover:text-primary-light font-medium"
              >
                {language === 'ko' ? '모두 읽음' : language === 'ja' ? 'すべて既読' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Content (same as desktop) */}
          <div className="overflow-y-auto pb-20" style={{ maxHeight: 'calc(70vh - 120px)' }}>
            {loading ? (
              <div className="p-8 text-center text-text-secondary">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                {language === 'ko' ? '로딩 중...' : language === 'ja' ? '読み込み中...' : 'Loading...'}
              </div>
            ) : (notifications.length === 0 || unreadCount === 0) ? (
              <div className="p-8 text-center">
                <svg className="w-16 h-16 mx-auto text-text-tertiary mb-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                <p className="text-text-secondary font-medium">
                  {language === 'ko' ? '새로운 알림이 없습니다' : language === 'ja' ? '新しい通知はありません' : 'No new notifications'}
                </p>
              </div>
            ) : (
              notifications.map((notification, index) => (
                <button
                  key={`${notification.type}-${notification.actor_user_id}-${notification.time}-${index}`}
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full px-4 py-3 flex gap-3 active:bg-surface-hover transition-colors border-b border-border text-left"
                >
                  <div className="flex-shrink-0 relative">
                    <img
                      src={getAvatarUrl(notification.actor_avatar_url)}
                      alt={notification.actor_display_name || notification.actor_username}
                      className="w-10 h-10 rounded-full object-cover border border-border"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-0.5">
                      {getNotificationIcon(notification)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary mb-1 line-clamp-2">
                      {getNotificationText(notification)}
                    </p>
                    {notification.item_title && (
                      <p className="text-xs text-text-secondary mb-1">
                        {language === 'ko' && notification.item_title_korean
                          ? notification.item_title_korean
                          : notification.item_title}
                      </p>
                    )}
                    <p className="text-xs text-text-tertiary">
                      {getTimeAgo(notification.time)}
                    </p>
                  </div>

                  {notification.item_image && (
                    <div className="flex-shrink-0">
                      <img
                        src={getImageUrl(notification.item_image)}
                        alt=""
                        className="w-12 h-16 object-cover rounded border border-border"
                      />
                    </div>
                  )}

                  {isUnread(notification) && (
                    <div className="flex-shrink-0 self-center">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface rounded-b-3xl">
              <button
                onClick={handleViewAll}
                className="w-full py-4 text-center text-primary font-medium text-sm"
              >
                {language === 'ko' ? '알림 모두보기 →' : language === 'ja' ? 'すべての通知を見る →' : 'View all notifications →'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
