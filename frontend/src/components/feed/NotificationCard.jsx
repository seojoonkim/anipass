import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import DefaultAvatar from '../common/DefaultAvatar';

export default function NotificationCard({
  notifications, // Array of notifications for the same content
  children, // Activity card content
  getTimeAgo,
  getAvatarUrl
}) {
  const { language } = useLanguage();
  const [collapsedComments, setCollapsedComments] = useState({});

  // 같은 actor의 같은 type 행동은 하나로 합치기
  const uniqueNotifications = useMemo(() => {
    const seen = new Map();

    notifications.forEach(notification => {
      const key = `${notification.actor_user_id}_${notification.type}`;

      // 같은 actor + type 조합이 없거나, 더 최근 알림이면 업데이트
      if (!seen.has(key) || new Date(notification.time) > new Date(seen.get(key).time)) {
        seen.set(key, notification);
      }
    });

    // 시간순으로 정렬 (최신순)
    return Array.from(seen.values()).sort((a, b) =>
      new Date(b.time) - new Date(a.time)
    );
  }, [notifications]);

  const getNotificationText = (notification) => {
    const actorName = notification.actor_display_name || notification.actor_username;

    if (notification.type === 'like') {
      return language === 'ko'
        ? `${actorName}님이 좋아요를 눌렀습니다`
        : language === 'ja'
        ? `${actorName}さんがいいねしました`
        : `${actorName} liked your ${notification.activity_type === 'anime_rating' || notification.activity_type === 'anime_review' ? 'anime rating' : 'character rating'}`;
    } else if (notification.type === 'comment') {
      return language === 'ko'
        ? `${actorName}님이 댓글을 남겼습니다`
        : language === 'ja'
        ? `${actorName}さんがコメントしました`
        : `${actorName} commented on your ${notification.activity_type === 'anime_rating' || notification.activity_type === 'anime_review' ? 'anime rating' : 'character rating'}`;
    }
    return '';
  };

  return (
    <div>
      {/* Notification Headers - attached to top of activity card */}
      <div className="bg-slate-700 rounded-t-xl">
        {uniqueNotifications.map((notification, index) => (
          <div key={index} className={`px-3 py-1.5 ${index > 0 ? 'border-t border-slate-600' : ''}`}>
            <div className="flex items-center gap-2">
              {/* Notification Type Icon */}
              <div className="flex-shrink-0">
                {notification.type === 'like' ? (
                  <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                )}
              </div>

              {/* Notification Text - single line */}
              <p className="flex-1 min-w-0 text-xs font-medium text-gray-100 truncate">
                {getNotificationText(notification)}
              </p>

              {/* Time - right aligned */}
              <span className="flex-shrink-0 text-[10px] text-gray-400">
                {getTimeAgo(notification.time)}
              </span>
            </div>

            {/* Show comment content if notification type is comment - expandable */}
            {notification.type === 'comment' && (notification.comment_text || notification.comment_content) && (
              <div
                className="mt-1 ml-5 pl-2 border-l-2 border-slate-500 cursor-pointer hover:border-slate-400 transition-colors"
                onClick={() => setCollapsedComments(prev => ({
                  ...prev,
                  [index]: !prev[index]
                }))}
              >
                <p className={`text-[11px] text-gray-300 italic ${collapsedComments[index] ? 'line-clamp-1' : ''}`}>
                  "{notification.comment_text || notification.comment_content}"
                </p>
                {(notification.comment_text || notification.comment_content || '').length > 50 && (
                  <span className="text-[10px] text-gray-500 hover:text-gray-400">
                    {collapsedComments[index]
                      ? (language === 'ko' ? '더보기' : language === 'ja' ? 'もっと見る' : 'more')
                      : (language === 'ko' ? '접기' : language === 'ja' ? '閉じる' : 'less')}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Original Activity Card (passed as children) - remove top rounded corners and connect border */}
      <div className="[&>*]:rounded-t-none">
        {children}
      </div>
    </div>
  );
}
