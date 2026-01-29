/**
 * ActivityCard - Unified activity card component
 *
 * Displays all types of user activities with customizable layout
 *
 * Usage:
 * <ActivityCard
 *   activity={activity}
 *   context="feed"
 *   showOptions={{ showItemImage: true, showItemTitle: true }}
 *   onUpdate={() => refetch()}
 * />
 */
import { useState, useEffect, useMemo, forwardRef, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useActivityLike, useActivityComments } from '../../hooks/useActivity';
import { getCurrentLevelInfo, levels } from '../../utils/otakuLevels';
import ActivityComments from './ActivityComments';
import ContentMenu from '../common/ContentMenu';
import DefaultAvatar from '../common/DefaultAvatar';
import { ratingService } from '../../services/ratingService';
import { characterService } from '../../services/characterService';
import { userPostService } from '../../services/userPostService';
import { activityService } from '../../services/activityService';
import { bookmarkService } from '../../services/bookmarkService';
import { getCharacterImageUrl, getCharacterImageFallback } from '../../utils/imageHelpers';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || API_BASE_URL;

/**
 * Context presets for common page layouts
 */
const CONTEXT_PRESETS = {
  feed: {
    showItemImage: true,
    showItemTitle: true,
    showUserInfo: true,
    compact: false
  },
  anime_page: {
    showItemImage: false,  // Already shown in page header
    showItemTitle: false,
    showUserInfo: true,
    compact: false
  },
  character_page: {
    showItemImage: false,
    showItemTitle: false,
    showUserInfo: true,
    compact: false
  },
  profile: {
    showItemImage: true,
    showItemTitle: true,
    showUserInfo: false,  // It's the user's own profile
    compact: false
  },
  notification: {
    showItemImage: true,
    showItemTitle: true,
    showUserInfo: true,
    compact: true  // Compact layout for notifications
  }
};

const ActivityCard = forwardRef(({
  activity,
  context = 'feed',
  showOptions = {},
  onUpdate = null,
  notificationData = null,  // Additional data for notification context
  onEditContent = null,  // Custom edit handler (e.g., for detail pages)
  onDeleteContent = null  // Custom delete handler (e.g., for detail pages)
}, ref) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Merge context preset with custom showOptions
  const preset = CONTEXT_PRESETS[context] || CONTEXT_PRESETS.feed;
  const finalShowOptions = { ...preset, ...showOptions };

  // State - Always show comments in notification context
  const [showComments, setShowComments] = useState(context === 'notification' || activity.comments_count > 0);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPostContent, setEditPostContent] = useState('');
  const editModalTextareaRef = useRef(null);

  // Focus textarea when edit modal opens, without scrolling
  useEffect(() => {
    if (showEditModal && editModalTextareaRef.current) {
      // Prevent auto-scroll by using preventScroll option
      editModalTextareaRef.current.focus({ preventScroll: true });
    }
  }, [showEditModal]);

  // Debug: Log activity data when component mounts
  useEffect(() => {
    if (activity.activity_type === 'user_post') {
      console.log('=== ActivityCard received user_post ===');
      console.log('review_id:', activity.review_id);
      console.log('item_id:', activity.item_id);
      console.log('user_id:', activity.user_id);
      console.log('Full activity:', activity);
    }
    if (activity.activity_type === 'rank_promotion') {
      console.log('=== ActivityCard received rank_promotion ===');
      console.log('metadata:', activity.metadata);
      console.log('metadata type:', typeof activity.metadata);
      console.log('metadata truthy:', !!activity.metadata);
      console.log('Full activity:', activity);
    }
  }, [activity]);

  // Initialize bookmark state from server
  useEffect(() => {
    const fetchBookmarkStatus = async () => {
      if (!user) {
        setBookmarked(false);
        return;
      }

      try {
        const isBookmarked = await bookmarkService.checkBookmark(activity.id);
        setBookmarked(isBookmarked);
      } catch (error) {
        console.error('Failed to check bookmark status:', error);
        // Fallback to localStorage
        const bookmarks = JSON.parse(localStorage.getItem('anipass_bookmarks') || '[]');
        setBookmarked(bookmarks.includes(activity.id));
      }
    };

    fetchBookmarkStatus();
  }, [activity.id, user]);

  // Hooks
  const { liked, likesCount, toggleLike } = useActivityLike(
    activity.id,
    activity.user_liked,
    activity.likes_count
  );

  const {
    comments,
    loading: commentsLoading,
    createComment,
    deleteComment
  } = useActivityComments(activity.id);

  // Helper functions
  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${IMAGE_BASE_URL}${url}`;
  };

  const getAvatarUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${IMAGE_BASE_URL}${url}`;
  };

  const getActivityLink = () => {
    if (activity.activity_type === 'anime_rating') {
      return `/anime/${activity.item_id}`;
    } else if (activity.activity_type === 'character_rating') {
      return `/character/${activity.item_id}`;
    }
    return null;
  };

  const getActivityTypeMessage = () => {
    const hasReview = activity.review_title || activity.review_content;

    if (activity.activity_type === 'anime_rating') {
      if (hasReview) {
        return language === 'ko' ? '애니를 리뷰했어요' : language === 'ja' ? 'アニメをレビューしました' : 'reviewed an anime';
      }
      return language === 'ko' ? '애니를 평가했어요' : language === 'ja' ? 'アニメを評価しました' : 'rated an anime';
    } else if (activity.activity_type === 'character_rating') {
      if (hasReview) {
        return language === 'ko' ? '캐릭터를 리뷰했어요' : language === 'ja' ? 'キャラクターをレビューしました' : 'reviewed a character';
      }
      return language === 'ko' ? '캐릭터를 평가했어요' : language === 'ja' ? 'キャラクターを評価しました' : 'rated a character';
    } else if (activity.activity_type === 'user_post') {
      return language === 'ko' ? '포스트를 작성했어요' : language === 'ja' ? 'ポストを作成しました' : 'created a post';
    } else if (activity.activity_type === 'rank_promotion') {
      return language === 'ko' ? '승급했어요!' : language === 'ja' ? 'ランクアップしました！' : 'ranked up!';
    }
    return '';
  };

  const toRoman = (num) => {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanNumerals[num - 1] || num;
  };

  const getRankName = (rankName) => {
    const level = levels.find(l => l.name === rankName);
    if (!level) return rankName;
    return language === 'ko' ? level.name : level.nameEn;
  };

  const getRelativeTime = (dateString) => {
    const now = new Date();

    // Backend sends UTC time without timezone info, so append 'Z' to parse as UTC
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString.replace(' ', 'T') + 'Z');

    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return language === 'ko' ? '방금 전' : language === 'ja' ? 'たった今' : 'Just now';
    } else if (diffMins < 60) {
      return language === 'ko' ? `${diffMins}분 전` : language === 'ja' ? `${diffMins}分前` : `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return language === 'ko' ? `${diffHours}시간 전` : language === 'ja' ? `${diffHours}時間前` : `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return language === 'ko' ? `${diffDays}일 전` : language === 'ja' ? `${diffDays}日前` : `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const levelInfo = getCurrentLevelInfo(activity.otaku_score || 0, language);

  // Calculate item image src with useMemo - use centralized helper for API proxy
  const itemImageSrc = useMemo(() => {
    let url = activity.item_image;
    if (!url) return null;

    // Normalize URL: ensure it starts with / if it's a relative path
    if (!url.startsWith('http') && !url.startsWith('/')) {
      url = `/${url}`;
    }

    // For character images, use the centralized helper (routes through API proxy)
    if (url.includes('anilist.co') && url.includes('/character/')) {
      // Extract character ID from URL or use item_id if it's a character rating
      const match = url.match(/\/b(\d+)-/);
      const characterId = match && match[1] ? match[1] :
        (activity.activity_type === 'character_rating' ? activity.item_id : null);
      return getCharacterImageUrl(characterId, url);
    }

    // For character images from R2 paths - use backend API proxy
    if (url.includes('/characters/')) {
      // Extract character ID from path like "/images/characters/8485.jpg"
      const match = url.match(/\/characters\/(\d+)\./);
      const characterId = match && match[1] ? match[1] :
        (activity.activity_type === 'character_rating' ? activity.item_id : null);
      if (characterId) {
        return `${API_BASE_URL}/api/images/characters/${characterId}.jpg`;
      }
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
  }, [activity.item_image, activity.item_id, activity.activity_type]);

  // Handle item image load error - use centralized fallback helper
  const handleItemImageError = (e) => {
    const nextSrc = getCharacterImageFallback(activity.item_image, e.target.src);
    if (nextSrc) {
      e.target.src = nextSrc;
    } else {
      e.target.src = '/placeholder-anime.svg';
    }
  };

  // Handlers
  const handleLikeClick = async () => {
    if (!user) {
      alert(language === 'ko' ? '로그인이 필요합니다.' : language === 'ja' ? 'ログインが必要です。' : 'Please login first.');
      return;
    }
    await toggleLike();
    // Don't call onUpdate() - let the hook handle optimistic updates
  };

  const handleBookmarkClick = async () => {
    console.log('Bookmark button clicked!', { user, bookmarked, activityId: activity.id });

    if (!user) {
      alert(language === 'ko' ? '로그인이 필요합니다.' : language === 'ja' ? 'ログインが必要です。' : 'Please login first.');
      return;
    }

    try {
      if (bookmarked) {
        // Remove bookmark from server
        await bookmarkService.removeBookmark(activity.id);
        setBookmarked(false);
        console.log('Bookmark removed from server');
      } else {
        // Add bookmark to server
        await bookmarkService.addBookmark(activity.id);
        setBookmarked(true);
        console.log('Bookmark added to server');
      }
    } catch (error) {
      console.error('Failed to update bookmark:', error);
      alert(language === 'ko' ? '북마크 업데이트에 실패했습니다.' : language === 'ja' ? 'ブックマークの更新に失敗しました。' : 'Failed to update bookmark.');

      // Revert state on error
      setBookmarked(!bookmarked);
    }
  };

  const handleCommentSubmit = async () => {
    if (!user) {
      alert(language === 'ko' ? '로그인이 필요합니다.' : language === 'ja' ? 'ログインが必要です。' : 'Please login first.');
      return;
    }

    if (!newCommentText.trim()) return;

    try {
      await createComment(newCommentText.trim());
      setNewCommentText('');
      // Don't call onUpdate() - useActivityComments already handles optimistic updates
    } catch (err) {
      console.error('Failed to create comment:', err);
      alert(language === 'ko' ? '댓글 작성에 실패했습니다.' : language === 'ja' ? 'コメントの作成に失敗しました。' : 'Failed to create comment.');
    }
  };

  const handleReplySubmit = async (parentCommentId) => {
    if (!user || !replyText.trim()) return;

    try {
      await createComment(replyText.trim(), parentCommentId);
      setReplyText('');
      setReplyingTo(null);
      // Don't call onUpdate() - useActivityComments already handles optimistic updates
    } catch (err) {
      console.error('Failed to create reply:', err);
      alert(language === 'ko' ? '답글 작성에 실패했습니다.' : language === 'ja' ? '返信の作成に失敗しました。' : 'Failed to create reply.');
    }
  };

  // ContentMenu handlers
  const handleEdit = () => {
    // Use custom handler if provided (for detail pages)
    if (onEditContent) {
      onEditContent(activity);
      return;
    }

    // For user posts, open edit modal
    if (activity.activity_type === 'user_post') {
      setEditPostContent(activity.content || '');
      setShowEditModal(true);
      return;
    }

    // Navigate to edit page for ratings
    if (activity.activity_type === 'anime_rating') {
      navigate(`/anime/${activity.item_id}`);
    } else if (activity.activity_type === 'character_rating') {
      navigate(`/character/${activity.item_id}`);
    }
  };

  const handleDelete = async () => {
    // Use custom handler if provided (for detail pages)
    if (onDeleteContent) {
      onDeleteContent(activity);
      return;
    }

    // Confirm before deleting
    const confirmMsg = language === 'ko' ? '정말 삭제하시겠습니까?' : language === 'ja' ? '本当に削除しますか？' : 'Are you sure you want to delete this?';
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      // Delete based on activity type
      if (activity.activity_type === 'user_post') {
        // user_post의 ID는 review_id 또는 item_id에 있을 수 있음
        const postId = activity.review_id || activity.item_id;
        if (postId) {
          // If we have the post ID, use userPostService (deletes from user_posts table)
          await userPostService.deletePost(postId);
        } else {
          // If no post ID, use activityService with activity.id (deletes from both tables via backend)
          await activityService.deleteActivity(activity.id);
        }
      } else if (activity.activity_type === 'anime_rating') {
        await ratingService.deleteRating(activity.item_id);
      } else if (activity.activity_type === 'character_rating') {
        await characterService.deleteCharacterRating(activity.item_id);
      }

      // Refresh the feed
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
      alert(language === 'ko' ? '삭제에 실패했습니다.' : language === 'ja' ? '削除に失敗しました。' : 'Failed to delete.');
    }
  };

  const handleEditRating = () => {
    // Use custom handler if provided (for detail pages)
    if (onEditContent) {
      onEditContent(activity, 'edit_rating');
      return;
    }

    // Navigate to detail page where user can change rating
    if (activity.activity_type === 'anime_rating') {
      navigate(`/anime/${activity.item_id}`);
    } else if (activity.activity_type === 'character_rating') {
      navigate(`/character/${activity.item_id}`);
    }
  };

  const handleAddReview = () => {
    // Use custom handler if provided (for detail pages)
    if (onEditContent) {
      onEditContent(activity, 'add_review');
      return;
    }

    // Navigate to detail page where user can add review
    if (activity.activity_type === 'anime_rating') {
      navigate(`/anime/${activity.item_id}`);
    } else if (activity.activity_type === 'character_rating') {
      navigate(`/character/${activity.item_id}`);
    }
  };

  const handleSaveEditPost = async () => {
    if (!editPostContent.trim()) {
      alert(language === 'ko' ? '내용을 입력해주세요.' : language === 'ja' ? '内容を入力してください。' : 'Please enter content.');
      return;
    }

    try {
      // user_post의 ID는 review_id 또는 item_id에 있을 수 있음
      const postId = activity.review_id || activity.item_id;

      if (postId) {
        // If we have the post ID, use userPostService (updates user_posts table)
        await userPostService.updatePost(postId, editPostContent);
      } else {
        // If no post ID, use activityService with activity.id (updates activities table + user_posts via backend)
        await activityService.updateActivity(activity.id, {
          review_content: editPostContent
        });
      }

      setShowEditModal(false);

      // Refresh the feed to show updated content
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to update post:', err);
      alert(language === 'ko' ? '포스트 수정에 실패했습니다.' : language === 'ja' ? 'ポストの編集に失敗しました。' : 'Failed to update post.');
    }
  };

  return (
    <div ref={ref} className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-3 hover:shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition-all">
      {/* Header: User Info + Activity Type + Timestamp + Menu */}
      {finalShowOptions.showUserInfo && (
        <div className="flex items-center mb-2 gap-2">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* User Avatar */}
            <Link to={`/user/${activity.user_id}`} className="flex-shrink-0">
              {activity.avatar_url && !avatarError ? (
                <img
                  src={getAvatarUrl(activity.avatar_url)}
                  alt={activity.display_name || activity.username}
                  loading="lazy"
                  decoding="async"
                  className="w-9 h-9 rounded-full object-cover border border-border"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <DefaultAvatar
                  username={activity.username}
                  displayName={activity.display_name}
                  size="sm"
                  className="w-9 h-9"
                />
              )}
            </Link>

            {/* User Info + Activity Type */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/user/${activity.user_id}`}
                  className="text-sm font-semibold text-gray-800 hover:text-primary transition-colors"
                >
                  {activity.display_name || activity.username}
                </Link>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: levelInfo.bgColor, border: `1px solid ${levelInfo.borderColorHex}` }}
                >
                  <span style={{ color: levelInfo.color }} className="font-bold">
                    {levelInfo.icon}
                  </span>{' '}
                  <span style={{ color: levelInfo.color }}>
                    {levelInfo.level} - {toRoman(levelInfo.rank)}
                  </span>
                </span>
                <span className="text-sm text-gray-600">
                  {getActivityTypeMessage()}
                </span>
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {getRelativeTime(activity.activity_time)}
          </span>

          {/* ContentMenu - Aligned with header (hidden for rank_promotion) */}
          {activity.activity_type !== 'rank_promotion' && (
            <div className="flex-shrink-0">
              <ContentMenu
                type={activity.activity_type}
                item={activity}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onEditRating={handleEditRating}
                onAddReview={handleAddReview}
              />
            </div>
          )}
        </div>
      )}

      {/* Content: Item Image + Details */}
      <div className="flex gap-4">
        {/* Item Image (anime/character thumbnail) */}
        {finalShowOptions.showItemImage && activity.item_image && itemImageSrc && (
          <Link
            to={getActivityLink()}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src={itemImageSrc}
              alt={activity.item_title || ''}
              loading="lazy"
              decoding="async"
              className="w-16 h-24 object-cover rounded border-2 border-transparent hover:border-primary transition-all"
              onError={handleItemImageError}
            />
          </Link>
        )}

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          {/* Item Title */}
          {finalShowOptions.showItemTitle && activity.item_title && (
            <div className="mb-2">
              <Link
                to={getActivityLink()}
                className="block text-base font-semibold text-gray-800 hover:text-primary transition-colors"
              >
                {language === 'ko' ? (
                  <>
                    {activity.item_title_korean || activity.item_title}
                    {activity.item_title_korean && activity.item_title && (
                      <span className="text-xs text-gray-400 font-normal ml-1">{activity.item_title}</span>
                    )}
                  </>
                ) : language === 'ja' ? (
                  <>
                    {activity.item_title_native || activity.item_title}
                    {activity.item_title_native && activity.item_title && (
                      <span className="text-xs text-gray-400 font-normal ml-1">({activity.item_title})</span>
                    )}
                  </>
                ) : (
                  <>
                    {activity.item_title || activity.item_title_korean}
                  </>
                )}
              </Link>
              {activity.activity_type === 'character_rating' && (activity.anime_title || activity.anime_title_korean) && (
                <Link
                  to={`/anime/${activity.anime_id}`}
                  className="text-xs text-gray-500 mt-0.5 hover:text-primary transition-colors block"
                >
                  from: {language === 'ko' ? (
                    <>
                      {activity.anime_title_korean || activity.anime_title}
                      {activity.anime_title_korean && activity.anime_title && (
                        <span className="text-[10px] text-gray-400 font-normal ml-1">({activity.anime_title})</span>
                      )}
                    </>
                  ) : language === 'ja' ? (
                    <>
                      {activity.anime_title_native || activity.anime_title}
                      {activity.anime_title_native && activity.anime_title && (
                        <span className="text-[10px] text-gray-400 font-normal ml-1">({activity.anime_title})</span>
                      )}
                    </>
                  ) : (
                    activity.anime_title
                  )}
                </Link>
              )}
            </div>
          )}

          {/* Rank Promotion Content */}
          {activity.activity_type === 'rank_promotion' && (() => {
            // Parse metadata if it's a string, otherwise use it directly
            let metadata;
            try {
              metadata = typeof activity.metadata === 'string'
                ? JSON.parse(activity.metadata)
                : activity.metadata;
            } catch (e) {
              console.error('Failed to parse rank promotion metadata:', e);
              metadata = null;
            }

            return (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-3">
                {metadata && metadata.old_rank && metadata.new_rank ? (
                  <>
                    <div className="flex items-center justify-center gap-3">
                      <div className="text-center">
                        <div className="text-xs text-gray-600 mb-1">{language === 'ko' ? '이전 등급' : language === 'ja' ? '以前のランク' : 'Previous Rank'}</div>
                        <div className="text-lg font-bold text-gray-700">
                          {getRankName(metadata.old_rank)} - {toRoman(metadata.old_level)}
                        </div>
                      </div>
                      <div className="text-3xl">🎉</div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600 mb-1">{language === 'ko' ? '새로운 등급' : language === 'ja' ? '新しいランク' : 'New Rank'}</div>
                        <div className="text-xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                          {getRankName(metadata.new_rank)} - {toRoman(metadata.new_level)}
                        </div>
                      </div>
                    </div>
                    <div className="text-center mt-3 text-sm text-gray-600">
                      {language === 'ko' ? '오타쿠 점수:' : language === 'ja' ? 'オタクスコア:' : 'Otaku Score:'} <span className="font-bold text-gray-800">{Math.floor(metadata.otaku_score)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-2xl mb-2">🎉</div>
                    <div className="text-lg font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                      {language === 'ko' ? '새로운 등급 달성!' : language === 'ja' ? '新しいランク達成！' : 'New Rank Achieved!'}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {language === 'ko' ? '(세부 정보를 불러오는 중...)' : language === 'ja' ? '(詳細を読み込み中...)' : '(Loading details...)'}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Rating */}
          {activity.rating && (
            <div className="flex items-center mb-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => {
                  const starValue = i + 1;
                  const fillPercentage =
                    activity.rating >= starValue
                      ? 100
                      : activity.rating > i
                        ? (activity.rating - i) * 100
                        : 0;

                  return (
                    <div key={i} className="relative w-[18px] h-[18px]">
                      <svg
                        className="w-[18px] h-[18px] text-gray-200"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {fillPercentage > 0 && (
                        <div
                          className="absolute top-0 left-0 overflow-hidden"
                          style={{ width: `${fillPercentage}%` }}
                        >
                          <svg
                            className="w-[18px] h-[18px]"
                            fill="url(#star-gradient)"
                            viewBox="0 0 20 20"
                          >
                            <defs>
                              <linearGradient id="star-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
                                <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
                                <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
                              </linearGradient>
                            </defs>
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="ml-1.5 text-sm font-medium text-gray-700">
                {activity.rating.toFixed(1)}
              </span>
            </div>
          )}

          {/* Review Title */}
          {activity.review_title && (
            <h3 className="text-base font-bold text-gray-900 mb-1">{activity.review_title}</h3>
          )}

          {/* Review Content or User Post Content */}
          {(activity.review_content || activity.content) && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {activity.is_spoiler ? (
                <details className="cursor-pointer">
                  <summary className="text-red-600 font-medium">
                    {language === 'ko' ? '스포일러 포함 (클릭하여 보기)' : language === 'ja' ? 'ネタバレ (クリックして表示)' : 'Spoiler (Click to reveal)'}
                  </summary>
                  <p className="mt-2">{activity.review_content || activity.content}</p>
                </details>
              ) : (
                <p>{activity.review_content || activity.content}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions: Like, Comment, Bookmark */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Like Button */}
          <button
            onClick={handleLikeClick}
            className="flex items-center gap-1.5 transition-all hover:scale-105"
            style={{
              color: liked ? '#DC2626' : '#6B7280'
            }}
          >
            {liked ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            )}
            <span className="text-xs font-medium">
              {language === 'ko' ? '좋아요' : language === 'ja' ? 'いいね' : 'Like'}
            </span>
            {likesCount > 0 && (
              <span className="text-xs font-medium">{likesCount}</span>
            )}
          </button>

          {/* Comment Button */}
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 transition-all hover:scale-105"
            style={{
              color: '#6B7280'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs font-medium">
              {language === 'ko' ? '댓글' : language === 'ja' ? 'コメント' : 'Comment'}
            </span>
            {activity.comments_count > 0 && (
              <span className="text-xs font-medium">{activity.comments_count}</span>
            )}
          </button>
        </div>

        {/* Bookmark Button */}
        <button
          onClick={handleBookmarkClick}
          className="flex items-center gap-1.5 transition-all hover:scale-105"
          style={{
            color: bookmarked ? '#DC2626' : '#6B7280'
          }}
        >
          {bookmarked ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          )}
          <span className="text-xs font-medium">
            {language === 'ko' ? '저장' : language === 'ja' ? '保存' : 'Save'}
          </span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <ActivityComments
          comments={comments}
          loading={commentsLoading}
          newCommentText={newCommentText}
          setNewCommentText={setNewCommentText}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          replyText={replyText}
          setReplyText={setReplyText}
          onCommentSubmit={handleCommentSubmit}
          onReplySubmit={handleReplySubmit}
          onDeleteComment={deleteComment}
          getAvatarUrl={getAvatarUrl}
          currentUser={user}
        />
      )}

      {/* Simple Edit Post Modal */}
      {showEditModal && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          style={{ zIndex: 9999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4 text-gray-800">
              {language === 'ko' ? '포스트 수정' : language === 'ja' ? 'ポストを編集' : 'Edit Post'}
            </h3>
            <textarea
              ref={editModalTextareaRef}
              value={editPostContent}
              onChange={(e) => setEditPostContent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              placeholder={language === 'ko' ? '내용을 입력하세요...' : language === 'ja' ? '内容を入力してください...' : 'Enter content...'}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                {language === 'ko' ? '취소' : language === 'ja' ? 'キャンセル' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveEditPost}
                className="px-4 py-2 text-white rounded-lg transition-all font-semibold"
                style={{
                  background: 'linear-gradient(135deg, #E1306C 0%, #F77737 50%, #FCAF45 100%)'
                }}
              >
                {language === 'ko' ? '저장' : language === 'ja' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

ActivityCard.displayName = 'ActivityCard';

// Memoize to prevent unnecessary re-renders
export default memo(ActivityCard);
