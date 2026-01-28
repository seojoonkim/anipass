import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useActivityPagination } from '../hooks/useActivity';
import { activityService } from '../services/activityService';
import { notificationService } from '../services/notificationService';
import { ratingService } from '../services/ratingService';
import { reviewService } from '../services/reviewService';
import { characterService } from '../services/characterService';
import { characterReviewService } from '../services/characterReviewService';
import { userPostService } from '../services/userPostService';
import { bookmarkService } from '../services/bookmarkService';
import ActivityCard from '../components/activity/ActivityCard';
import NotificationCard from '../components/feed/NotificationCard';
import EditReviewModal from '../components/common/EditReviewModal';
import DefaultAvatar from '../components/common/DefaultAvatar';
import { getAvatarUrl as getAvatarUrlHelper, getCharacterImageUrl, getCharacterImageFallback } from '../utils/imageHelpers';
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';

export default function Feed() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const [feedFilter, setFeedFilter] = useState(searchParams.get('filter') || 'all');
  const [newPostContent, setNewPostContent] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [savedActivities, setSavedActivities] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editMode, setEditMode] = useState('edit'); // 'edit' | 'add_review' | 'edit_rating'

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState(null);

  // Scroll observer ref
  const observerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);
  const sidebarRef = useRef(null);

  // Cache removed - was causing inconsistent data on tab switching

  // Memoize filters to prevent unnecessary re-renders
  const paginationFilters = useMemo(() => ({
    followingOnly: feedFilter === 'following'
  }), [feedFilter]);

  // Skip pagination for 'saved' and 'notifications' filters
  const skipPagination = feedFilter === 'saved' || feedFilter === 'notifications';

  // Use pagination hook for infinite scroll (disabled for saved/notifications)
  const {
    activities,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reset: resetActivities,
    removeActivity
  } = useActivityPagination(paginationFilters, 8, skipPagination);

  // Cache disabled - was causing inconsistent data on tab switching
  // Clear any existing cache on mount
  useEffect(() => {
    try {
      sessionStorage.removeItem('feed_cache_all');
      sessionStorage.removeItem('feed_cache_following');
    } catch (err) {
      // Ignore
    }
  }, []);

  // Don't auto-reset on filter change - let the hook handle it naturally
  // This prevents flickering when switching tabs

  // No auto-load for 'saved' filter - we fetch bookmarked activities from server

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (feedFilter === 'notifications' || feedFilter === 'saved') return; // Skip for notifications and saved

    const options = {
      root: null,
      rootMargin: '200px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
        loadMore();
      }
    }, options);

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadingMore, loadMore, feedFilter]);

  // Update feedFilter when URL changes
  useEffect(() => {
    const filterParam = searchParams.get('filter') || 'all';
    if (filterParam !== feedFilter) {
      setFeedFilter(filterParam);
    }

    // Handle highlight parameter
    const highlightKey = searchParams.get('highlight');
    if (highlightKey) {
      setTimeout(() => {
        const element = document.getElementById(`activity-${highlightKey}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-animation');
          setTimeout(() => {
            element.classList.remove('highlight-animation');
          }, 3000);
        }
      }, 500);
    }
  }, [searchParams]);

  // Load notifications when filter is 'notifications'
  useEffect(() => {
    if (feedFilter === 'notifications') {
      loadNotifications();
    } else if (feedFilter === 'saved') {
      loadSavedActivities();
    }
  }, [feedFilter]);


  const loadNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const notificationData = await notificationService.getNotifications(50, 0);

      // Mark as read
      await notificationService.markAsRead();

      if (!notificationData.items || notificationData.items.length === 0) {
        setNotifications([]);
        setNotificationsLoading(false);
        return;
      }

      // Group notifications by item_id + activity_type
      const groupedNotifications = {};
      notificationData.items.forEach((notification) => {
        const key = `${notification.activity_type}_${notification.item_id}`;
        if (!groupedNotifications[key]) {
          groupedNotifications[key] = [];
        }
        groupedNotifications[key].push(notification);
      });

      // Transform to activities format
      const transformedActivities = Object.values(groupedNotifications).map(notificationGroup => {
        const latestNotification = notificationGroup[0];

        return {
          // Use real activity_id for like/comment functionality
          id: latestNotification.activity_id,
          activity_type: latestNotification.activity_type,
          user_id: latestNotification.target_user_id,
          item_id: latestNotification.item_id,
          username: latestNotification.activity_username,
          display_name: latestNotification.activity_display_name,
          avatar_url: latestNotification.activity_avatar_url,
          otaku_score: latestNotification.activity_otaku_score || 0,
          item_title: latestNotification.item_title,
          item_title_korean: latestNotification.item_title,
          item_image: latestNotification.item_image,
          anime_id: latestNotification.anime_id,
          anime_title: latestNotification.anime_title,
          anime_title_korean: latestNotification.anime_title_korean,
          rating: latestNotification.my_rating,
          review_content: latestNotification.activity_text,
          review_title: null,
          is_spoiler: false,
          activity_time: latestNotification.activity_created_at,
          likes_count: latestNotification.activity_likes_count,
          comments_count: latestNotification.activity_comments_count,
          user_liked: Boolean(latestNotification.user_has_liked),
          _notifications: notificationGroup
        };
      });

      setNotifications(transformedActivities);
      setNotificationsLoading(false);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setNotifications([]);
      setNotificationsLoading(false);
    }
  };

  const loadSavedActivities = async () => {
    try {
      setSavedLoading(true);
      const data = await bookmarkService.getBookmarks(true);
      setSavedActivities(data.items || []);
      setSavedLoading(false);
    } catch (err) {
      console.error('Failed to load saved activities:', err);
      setSavedActivities([]);
      setSavedLoading(false);
    }
  };


  const handleCreatePost = async () => {
    if (!newPostContent || !newPostContent.trim()) return;

    try {
      // Use userPostService instead of activityService for proper content handling
      await userPostService.createPost(newPostContent.trim());
      setNewPostContent('');

      resetActivities();
    } catch (err) {
      console.error('Failed to create post:', err);
      alert(language === 'ko' ? '게시 실패' : language === 'ja' ? '投稿失敗' : 'Failed to post');
    }
  };

  const getAvatarUrl = (avatarUrl) => {
    return getAvatarUrlHelper(avatarUrl) || '/placeholder-avatar.png';
  };

  const getItemImageUrl = (url, characterId = null) => {
    if (!url) return '/placeholder-anime.svg';

    // Normalize URL: ensure it starts with / if it's a relative path
    if (!url.startsWith('http') && !url.startsWith('/')) {
      url = `/${url}`;
    }

    // For character images from R2 paths, extract ID and use API proxy
    if (url.includes('/characters/')) {
      // Extract character ID from path like "/images/characters/8485.jpg"
      const match = url.match(/\/characters\/(\d+)\./);
      const extractedId = match && match[1] ? match[1] : characterId;
      if (extractedId) {
        return `${API_BASE_URL}/api/images/characters/${extractedId}.jpg`;
      }
    }

    // For character images from AniList URLs, use the centralized helper
    if (url.includes('anilist.co') && url.includes('/character/')) {
      return getCharacterImageUrl(characterId, url);
    }

    // If it's a relative path, use IMAGE_BASE_URL
    if (!url.startsWith('http')) {
      return `${IMAGE_BASE_URL}${url}`;
    }

    // External URLs (AniList anime covers, etc) - optimize size
    if (url.includes('anilist.co') && url.includes('/large/')) {
      // Use medium size for faster loading
      return url.replace('/large/', '/medium/');
    }

    return url;
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    // Backend sends UTC time without timezone info, so append 'Z' to parse as UTC
    const activityTime = new Date(timestamp.endsWith('Z') ? timestamp : timestamp.replace(' ', 'T') + 'Z');
    const diff = now - activityTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (language === 'ko') {
      if (minutes < 60) return `${Math.max(1, minutes)}분 전`;
      if (hours < 24) return `${hours}시간 전`;
      if (days < 7) return `${days}일 전`;
      return activityTime.toLocaleDateString('ko-KR');
    } else if (language === 'ja') {
      if (minutes < 60) return `${Math.max(1, minutes)}分前`;
      if (hours < 24) return `${hours}時間前`;
      if (days < 7) return `${days}日前`;
      return activityTime.toLocaleDateString('ja-JP');
    } else {
      if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return activityTime.toLocaleDateString('en-US');
    }
  };

  // Get activities based on filter
  const getFilteredActivities = () => {
    if (feedFilter === 'notifications') {
      return notifications;
    } else if (feedFilter === 'saved') {
      return savedActivities;
    }

    // No more cache - just return activities directly
    console.log(`[Feed] Returning activities for filter=${feedFilter}:`, {
      count: activities.length,
      firstActivity: activities[0] ? {
        id: activities[0].id,
        username: activities[0].username,
        type: activities[0].activity_type
      } : null
    });
    return activities;
  };

  const filteredActivities = getFilteredActivities();
  const isLoading = feedFilter === 'notifications' ? notificationsLoading :
    feedFilter === 'saved' ? savedLoading : loading;

  // Edit modal handlers
  const handleEditContent = (activity, mode = 'edit') => {
    setEditingActivity(activity);
    setEditMode(mode);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (formData) => {
    if (!editingActivity) return;

    const isAnime = editingActivity.activity_type === 'anime_rating';

    try {
      if (editMode === 'edit_rating') {
        // 별점만 수정
        if (isAnime) {
          await ratingService.rateAnime(editingActivity.item_id, {
            rating: formData.rating,
            status: 'RATED'
          });
        } else {
          await characterService.rateCharacter(editingActivity.item_id, {
            rating: formData.rating
          });
        }
      } else if (editMode === 'add_review') {
        // 리뷰 추가
        if (isAnime) {
          await reviewService.createReview({
            anime_id: editingActivity.item_id,
            rating: formData.rating,
            content: formData.content,
            is_spoiler: formData.is_spoiler
          });
        } else {
          await characterReviewService.createReview({
            character_id: editingActivity.item_id,
            rating: formData.rating,
            content: formData.content,
            is_spoiler: formData.is_spoiler
          });
        }
      } else {
        // 리뷰 수정
        // 리뷰 내용이 있으면 리뷰 업데이트 (별점도 함께 전달)
        if (formData.content && formData.content.trim()) {
          // Get the actual review ID from the review table (not activity ID)
          let reviewId;
          if (isAnime) {
            const myReview = await reviewService.getMyReview(editingActivity.item_id);
            reviewId = myReview.review_id || myReview.id;
            await reviewService.updateReview(reviewId, {
              content: formData.content,
              is_spoiler: formData.is_spoiler,
              rating: formData.rating // 별점도 함께 전달
            });
          } else {
            const myReview = await characterReviewService.getMyReview(editingActivity.item_id);
            reviewId = myReview.review_id || myReview.id;
            await characterReviewService.updateReview(reviewId, {
              content: formData.content,
              is_spoiler: formData.is_spoiler,
              rating: formData.rating // 별점도 함께 전달
            });
          }
        } else if (formData.rating !== editingActivity.rating) {
          // 리뷰 내용 없이 별점만 변경된 경우
          if (isAnime) {
            await ratingService.rateAnime(editingActivity.item_id, {
              rating: formData.rating,
              status: 'RATED'
            });
          } else {
            await characterService.rateCharacter(editingActivity.item_id, {
              rating: formData.rating
            });
          }
        }
      }

      // Refresh activities
      resetActivities();
    } catch (err) {
      console.error('Failed to save:', err);
      throw err;
    }
  };

  const handleOpenDeleteModal = (activity) => {
    setActivityToDelete(activity);
    setShowDeleteModal(true);
  };

  const handleDeleteContent = async (deleteType) => {
    if (!activityToDelete) return;

    const activity = activityToDelete;
    const activityId = activity.id;
    const isAnime = activity.activity_type === 'anime_rating';
    const isUserPost = activity.activity_type === 'user_post';
    const hasReview = activity.review_content && activity.review_content.trim();

    // Optimistic UI - 즉시 화면에서 제거
    removeActivity(activityId);
    setShowDeleteModal(false);
    setActivityToDelete(null);

    try {
      if (isUserPost) {
        // 일반 포스트 삭제
        const postId = activity.review_id || activity.item_id;
        if (postId) {
          await userPostService.deletePost(postId);
        } else {
          await activityService.deleteActivity(activityId);
        }
      } else if (deleteType === 'review_only' && hasReview) {
        // 리뷰만 삭제 (별점은 유지) - 피드 새로고침 필요
        if (isAnime) {
          await reviewService.deleteMyReview(activity.item_id);
        } else {
          await characterReviewService.deleteMyReview(activity.item_id);
        }
        // 리뷰만 삭제 시 activity가 남아있으므로 새로고침
        resetActivities();
      } else {
        // 별점까지 모두 삭제
        if (isAnime) {
          await ratingService.deleteRating(activity.item_id);
        } else {
          await characterService.deleteCharacterRating(activity.item_id);
        }
      }
    } catch (err) {
      // 404 = 이미 삭제됨 -> 무시
      if (err.response?.status === 404) {
        console.log('Already deleted');
        return;
      }
      console.error('Failed to delete:', err);
      // 실패 시 새로고침하여 원래 상태로
      resetActivities();
    }
  };

  return (
    <div className="min-h-screen pt-10 md:pt-12 bg-transparent">
      {/* Fixed Sidebar - Desktop only */}
      <aside
        ref={sidebarRef}
        className="hidden md:block fixed top-20 w-56 z-40"
        style={{
          left: 'max(1rem, calc((100vw - 1180px) / 2 + 1rem))'
        }}
      >
        <nav className="flex flex-col gap-2">
          <button
            onClick={() => setSearchParams({ filter: 'all' })}
            className={`w-full text-left px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${feedFilter === 'all'
              ? 'bg-[#3797F0] text-white font-semibold'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            {language === 'ko' ? '전체 보기' : language === 'ja' ? '全て表示' : 'View All'}
          </button>

          <button
            onClick={() => setSearchParams({ filter: 'following' })}
            className={`w-full text-left px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${feedFilter === 'following'
              ? 'bg-[#3797F0] text-white font-semibold'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {language === 'ko' ? '팔로잉 보기' : language === 'ja' ? 'フォロー中' : 'Following'}
          </button>

          <button
            onClick={() => setSearchParams({ filter: 'notifications' })}
            className={`w-full text-left px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${feedFilter === 'notifications'
              ? 'bg-[#3797F0] text-white font-semibold'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {language === 'ko' ? '알림 보기' : language === 'ja' ? '通知' : 'Notifications'}
          </button>

          <button
            onClick={() => setSearchParams({ filter: 'saved' })}
            className={`w-full text-left px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${feedFilter === 'saved'
              ? 'bg-[#3797F0] text-white font-semibold'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            {language === 'ko' ? '저장한 피드' : language === 'ja' ? '保存済み' : 'Saved'}
          </button>
        </nav>
      </aside>

      {/* Main Content - with left margin for sidebar on desktop */}
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="md:ml-64">
          {/* Feed Content */}
          <div className="w-full max-w-2xl mx-auto md:mx-0">
            {/* Post Composer */}
            {user && (
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-4 mb-6">
                <div className="flex gap-3">
                  {user.avatar_url ? (
                    <img
                      src={getAvatarUrl(user.avatar_url)}
                      alt={user.display_name || user.username}
                      className="w-12 h-12 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <DefaultAvatar
                      username={user.username}
                      displayName={user.display_name}
                      size="lg"
                      className="w-12 h-12"
                    />
                  )}
                  <div className="flex-1">
                    <textarea
                      value={newPostContent}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      placeholder={language === 'ko' ? '무슨 생각을 하고 계신가요?' : language === 'ja' ? '今何を考えていますか？' : "What's on your mind?"}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      rows="3"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleCreatePost}
                        disabled={!newPostContent.trim()}
                        className="px-4 py-2 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                        style={newPostContent.trim() ? { backgroundColor: '#3797F0', fontWeight: '600' } : {}}
                      >
                        {language === 'ko' ? '게시' : language === 'ja' ? '投稿' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Feed */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-4 animate-pulse">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                        <div className="h-4 w-24 bg-gray-200 rounded"></div>
                        <div className="h-4 w-20 bg-gray-200 rounded"></div>
                      </div>
                      <div className="h-3 w-16 bg-gray-200 rounded"></div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-16 h-24 bg-gray-200 rounded"></div>
                      <div className="flex-1">
                        <div className="h-4 w-3/4 bg-gray-200 rounded mb-2"></div>
                        <div className="h-3 w-1/2 bg-gray-200 rounded mb-2"></div>
                        <div className="h-3 w-full bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="text-center py-12">
                {feedFilter === 'notifications' ? (
                  <>
                    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p className="text-gray-600 text-lg font-medium mb-2">
                      {language === 'ko' ? '알림이 없습니다' : language === 'ja' ? '通知がありません' : 'No notifications yet'}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {language === 'ko'
                        ? '다른 사용자가 회원님의 평가에 좋아요를 누르거나 댓글을 남기면 여기에 표시됩니다'
                        : language === 'ja'
                          ? '他のユーザーがあなたの評価にいいねやコメントをすると、ここに表示されます'
                          : 'When someone likes or comments on your ratings, you\'ll see it here'}
                    </p>
                  </>
                ) : feedFilter === 'saved' ? (
                  <>
                    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    <p className="text-gray-600 text-lg font-medium mb-2">
                      {language === 'ko' ? '저장한 활동이 없습니다' : language === 'ja' ? '保存されたアクティビティがありません' : 'No saved activities yet'}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {language === 'ko'
                        ? '활동 카드의 북마크 아이콘을 클릭하여 나중에 보고 싶은 활동을 저장하세요'
                        : language === 'ja'
                          ? 'アクティビティカードのブックマークアイコンをクリックして、後で見たいアクティビティを保存してください'
                          : 'Click the bookmark icon on activity cards to save them for later'}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-600">
                    {language === 'ko' ? '아직 활동이 없습니다.' : language === 'ja' ? 'まだ活動がありません' : 'No activities yet.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredActivities.map((activity) => {
                  // Render notification-wrapped activity
                  if (activity._notifications) {
                    return (
                      <NotificationCard
                        key={activity.id}
                        notifications={activity._notifications}
                        getTimeAgo={getTimeAgo}
                        getAvatarUrl={getAvatarUrl}
                      >
                        <ActivityCard
                          activity={activity}
                          context="notification"
                          onUpdate={resetActivities}
                          // user_post는 자체 edit modal 사용, 나머지는 EditReviewModal 사용
                          onEditContent={activity.activity_type === 'user_post' ? null : handleEditContent}
                          onDeleteContent={handleOpenDeleteModal}
                        />
                      </NotificationCard>
                    );
                  }

                  // Regular activity card
                  return (
                    <div key={activity.id} id={`activity-${activity.id}`}>
                      <ActivityCard
                        activity={activity}
                        context="feed"
                        onUpdate={resetActivities}
                        // user_post는 자체 edit modal 사용, 나머지는 EditReviewModal 사용
                        onEditContent={activity.activity_type === 'user_post' ? null : handleEditContent}
                        onDeleteContent={handleOpenDeleteModal}
                      />
                    </div>
                  );
                })}

                {/* Infinite scroll trigger */}
                {feedFilter !== 'notifications' && feedFilter !== 'saved' && (
                  <div ref={loadMoreTriggerRef} className="h-20 flex items-center justify-center">
                    {loadingMore && (
                      <div className="text-gray-500 text-sm">
                        {language === 'ko' ? '로딩 중...' : language === 'ja' ? '読込中...' : 'Loading...'}
                      </div>
                    )}
                    {!loading && !loadingMore && !hasMore && activities.length > 0 && (
                      <div className="text-gray-400 text-sm">
                        {language === 'ko' ? '모든 활동을 불러왔습니다' : language === 'ja' ? '全てのアクティビティを読み込みました' : 'All activities loaded'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Highlight Animation Styles */}
      <style>{`
        @keyframes highlightPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(63, 193, 201, 0.7);
            border-color: rgba(63, 193, 201, 0.3);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(63, 193, 201, 0);
            border-color: rgba(63, 193, 201, 1);
          }
        }

        .highlight-animation {
          animation: highlightPulse 1.5s ease-in-out 2;
          border: 2px solid #A8E6CF !important;
        }
      `}</style>

      {/* Edit Review Modal */}
      <EditReviewModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingActivity(null);
        }}
        activity={editingActivity}
        onSave={handleSaveEdit}
        mode={editMode}
      />

      {/* Delete Modal */}
      {showDeleteModal && activityToDelete && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          onClick={() => setShowDeleteModal(false)}
        >
          <div className="bg-surface rounded-xl p-6 max-w-md w-full mx-4 border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2 text-text-primary">
              {activityToDelete.activity_type === 'user_post'
                ? (language === 'ko' ? '포스트 삭제' : language === 'ja' ? '投稿を削除' : 'Delete Post')
                : (language === 'ko' ? '삭제 옵션' : language === 'ja' ? '削除オプション' : 'Delete Options')}
            </h3>

            {activityToDelete.activity_type === 'user_post' ? (
              <>
                <p className="text-sm text-text-secondary mb-6">
                  {language === 'ko'
                    ? '이 포스트를 삭제하시겠습니까?'
                    : language === 'ja'
                      ? 'この投稿を削除してもよろしいですか？'
                      : 'Are you sure you want to delete this post?'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDeleteContent('all')}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                  >
                    {language === 'ko' ? '삭제' : language === 'ja' ? '削除' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-secondary rounded-lg font-medium transition-colors"
                  >
                    {language === 'ko' ? '취소' : language === 'ja' ? 'キャンセル' : 'Cancel'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Show what's being deleted */}
                <div className="mb-4 p-3 bg-surface-hover rounded-lg border border-border flex gap-3">
                  {activityToDelete.item_image && (
                    <img
                      src={getItemImageUrl(activityToDelete.item_image)}
                      alt={activityToDelete.item_title_korean || activityToDelete.item_title}
                      className="w-16 h-24 object-cover rounded flex-shrink-0"
                      onError={(e) => {
                        e.target.src = '/placeholder-anime.svg';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary mb-1">
                      {activityToDelete.activity_type === 'character_rating' ? (
                        <>
                          {activityToDelete.item_title}{' '}
                          <span className="text-text-secondary">({activityToDelete.item_title_korean})</span>
                        </>
                      ) : (
                        activityToDelete.item_title_korean || activityToDelete.item_title
                      )}
                    </p>
                    {activityToDelete.activity_type === 'character_rating' && activityToDelete.anime_title && (
                      <p className="text-xs text-text-secondary mb-1">
                        from: {activityToDelete.anime_title_korean || activityToDelete.anime_title}
                      </p>
                    )}
                    <p className="text-xs text-text-tertiary">
                      {activityToDelete.activity_type === 'character_rating'
                        ? (language === 'ko' ? '캐릭터' : language === 'ja' ? 'キャラクター' : 'Character')
                        : (language === 'ko' ? '애니메이션' : language === 'ja' ? 'アニメーション' : 'Anime')}
                    </p>
                  </div>
                </div>

                {activityToDelete.review_content && activityToDelete.review_content.trim() ? (
                  <>
                    <p className="text-sm text-text-secondary mb-6">
                      {language === 'ko'
                        ? '이 평가에는 리뷰가 포함되어 있습니다. 어떻게 삭제하시겠습니까?'
                        : language === 'ja'
                          ? 'この評価にはレビューが含まれています。どのように削除しますか？'
                          : 'This rating includes a review. How would you like to delete it?'}
                    </p>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => handleDeleteContent('review_only')}
                        className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                      >
                        {language === 'ko' ? '리뷰만 삭제 (별점 유지)' : language === 'ja' ? 'レビューのみ削除 (評価は保持)' : 'Delete review only (Keep rating)'}
                      </button>
                      <button
                        onClick={() => handleDeleteContent('all')}
                        className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                      >
                        {language === 'ko' ? '별점까지 모두 삭제' : language === 'ja' ? '評価とレビューを削除' : 'Delete rating and review'}
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(false)}
                        className="w-full px-4 py-3 bg-surface-hover hover:bg-surface-hover/80 text-text-secondary rounded-lg font-medium transition-colors"
                      >
                        {language === 'ko' ? '취소' : language === 'ja' ? 'キャンセル' : 'Cancel'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-text-secondary mb-6">
                      {language === 'ko'
                        ? '이 평가를 삭제하시겠습니까?'
                        : language === 'ja'
                          ? 'この評価を削除してもよろしいですか？'
                          : 'Are you sure you want to delete this rating?'}
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDeleteContent('all')}
                        className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                      >
                        {language === 'ko' ? '삭제' : language === 'ja' ? '削除' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(false)}
                        className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-secondary rounded-lg font-medium transition-colors"
                      >
                        {language === 'ko' ? '취소' : language === 'ja' ? 'キャンセル' : 'Cancel'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
