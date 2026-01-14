import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { userService } from '../services/userService';
import { ratingService } from '../services/ratingService';
import { followService } from '../services/followService';
import { feedService } from '../services/feedService';
import { activityCommentService } from '../services/activityCommentService';
import { activityLikeService } from '../services/activityLikeService';
import { commentLikeService } from '../services/commentLikeService';
import { userPostService } from '../services/userPostService';
import * as ActivityUtils from '../utils/activityUtils';
import Navbar from '../components/common/Navbar';
import OtakuMeter from '../components/profile/OtakuMeter';
import GenrePreferences from '../components/profile/GenrePreferences';
import RatingDistributionChart from '../components/profile/RatingDistributionChart';
import YearDistributionChart from '../components/profile/YearDistributionChart';
import StarRating from '../components/common/StarRating';
import FormatDistribution from '../components/profile/FormatDistribution';
import EpisodeLengthChart from '../components/profile/EpisodeLengthChart';
import RatingStatsCard from '../components/profile/RatingStatsCard';
import StudioStats from '../components/profile/StudioStats';
import SeasonStats from '../components/profile/SeasonStats';
import GenreCombinationChart from '../components/profile/GenreCombinationChart';
import api from '../services/api';
import { getCurrentLevelInfo } from '../utils/otakuLevels';
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';
import { getCharacterImageUrl, getCharacterImageFallback, getCharacterDisplayName, getAvatarUrl as getAvatarUrlHelper, getAvatarFallback } from '../utils/imageHelpers';

export default function MyAniPass() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { userId } = useParams();
  const isOwnProfile = !userId || parseInt(userId) === user?.id;
  const [profileUser, setProfileUser] = useState(null);
  const displayUser = isOwnProfile ? user : profileUser;
  const [activeTab, setActiveTab] = useState('feed');
  const [animeSubMenu, setAnimeSubMenu] = useState('all'); // 애니 서브메뉴: all, 5, 4, 3, 2, 1, 0, watchlist, pass
  const [characterSubMenu, setCharacterSubMenu] = useState('all'); // 캐릭터 서브메뉴: all, 5, 4, 3, 2, 1, 0, want, pass

  const toRoman = (num) => {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanNumerals[num - 1] || num;
  };

  // Generate consistent avatar gradient based on username
  const getAvatarGradient = (username) => {
    if (!username) return 'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)';

    // Hash username to get consistent colors
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    const gradients = [
      'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)', // Instagram
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // Pink
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // Blue
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Green
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // Orange
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', // Teal
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // Pastel
    ];

    return gradients[Math.abs(hash) % gradients.length];
  };
  const [stats, setStats] = useState(null);
  const [genrePreferences, setGenrePreferences] = useState([]);
  const [ratingDistribution, setRatingDistribution] = useState([]);
  const [yearDistribution, setYearDistribution] = useState([]);
  const [allAnime, setAllAnime] = useState([]); // 모든 애니 (평가, 보고싶어요, 관심없어요 포함)
  const [displayedAnime, setDisplayedAnime] = useState([]); // 현재 표시되는 애니
  const [allCharacters, setAllCharacters] = useState([]); // 모든 캐릭터 (평가, 알고싶어요, 관심없어요 포함)
  const [displayedCharacters, setDisplayedCharacters] = useState([]); // 현재 표시되는 캐릭터
  const [allRatedCharacters, setAllRatedCharacters] = useState([]); // 평가한 캐릭터만
  const [wantCharacters, setWantCharacters] = useState([]); // 알고싶어요 캐릭터
  const [passCharacters, setPassCharacters] = useState([]); // 관심없어요 캐릭터
  const [ratedAnime, setRatedAnime] = useState([]);
  const [allRatedAnime, setAllRatedAnime] = useState([]); // 전체 평가 애니 캐시
  const [ratedFilter, setRatedFilter] = useState('all'); // 별점 필터
  const [watchlistAnime, setWatchlistAnime] = useState([]);
  const [passAnime, setPassAnime] = useState([]);
  const [watchTime, setWatchTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  // Phase 1 & 2 통계
  const [formatDistribution, setFormatDistribution] = useState([]);
  const [episodeLengthDistribution, setEpisodeLengthDistribution] = useState([]);
  const [ratingStats, setRatingStats] = useState(null);
  const [studioStats, setStudioStats] = useState([]);
  const [seasonStats, setSeasonStats] = useState([]);
  const [genreCombinations, setGenreCombinations] = useState([]);
  // 탭별 로드 완료 여부 추적
  const [loadedTabs, setLoadedTabs] = useState({
    anipass: false,
    anime: false,
    character: false,
    feed: false
  });
  // 팔로우 관련 상태
  const [followCounts, setFollowCounts] = useState({ followers_count: 0, following_count: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [followModalType, setFollowModalType] = useState('followers'); // 'followers' or 'following'
  const [followList, setFollowList] = useState([]);
  // 피드 관련 상태
  const [userActivities, setUserActivities] = useState([]);
  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const [activityLikes, setActivityLikes] = useState({});
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [commentLikes, setCommentLikes] = useState({});
  const [replyingTo, setReplyingTo] = useState({});
  const [newPostContent, setNewPostContent] = useState('');
  const [failedImages, setFailedImages] = useState(new Set());

  // Infinite scroll observer ref
  const observer = useRef();
  const lastActivityElementRef = useCallback(node => {
    if (loadingMoreFeed) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreFeed) {
        loadMoreFeed();
      }
    });
    if (node) observer.current.observe(node);
  }, [loadingMoreFeed, hasMoreFeed]);

  useEffect(() => {
    // Reset states when userId changes (switching between profiles)
    if (userId !== undefined) {
      setUserActivities([]);
      setFeedOffset(0);
      setHasMoreFeed(true);
      setLoadedTabs({
        anipass: false,
        anime: false,
        character: false,
        feed: false
      });
    }
    loadData();
    loadFollowData();
  }, [activeTab, userId]);

  const loadFollowData = async () => {
    try {
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;

      // 팔로우 카운트 로드
      const counts = await followService.getFollowCounts(targetUserId);
      setFollowCounts(counts);

      // 다른 사용자의 프로필이면 팔로잉 여부 확인
      if (!isOwnProfile) {
        const followStatus = await followService.isFollowing(targetUserId);
        setIsFollowing(followStatus.is_following);
      }
    } catch (err) {
      console.error('Failed to load follow data:', err);
    }
  };

  const handleFollowToggle = async () => {
    try {
      const targetUserId = userId || user?.id;
      if (isFollowing) {
        await followService.unfollowUser(targetUserId);
        setIsFollowing(false);
        setFollowCounts(prev => ({ ...prev, followers_count: prev.followers_count - 1 }));
      } else {
        await followService.followUser(targetUserId);
        setIsFollowing(true);
        setFollowCounts(prev => ({ ...prev, followers_count: prev.followers_count + 1 }));
      }
    } catch (err) {
      console.error('Failed to toggle follow:', err);
    }
  };

  const openFollowModal = async (type) => {
    try {
      setFollowModalType(type);
      setShowFollowModal(true);

      const targetUserId = userId || user?.id;
      if (type === 'followers') {
        const data = await followService.getFollowers(targetUserId);
        setFollowList(data.items || []);
      } else {
        const data = await followService.getFollowing(targetUserId);
        setFollowList(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load follow list:', err);
    }
  };

  // 애니 서브메뉴 필터링
  const filterAnimeBySubMenu = (animeData, submenu) => {
    let filtered = [];

    if (submenu === 'all') {
      // 모두 선택 시 모든 항목 포함 (평가한 것 + 보고싶어요 + 관심없어요)
      filtered = animeData;
    } else if (submenu === '5') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating === 5.0);
    } else if (submenu === '4') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating >= 4.0 && a.rating < 5.0);
    } else if (submenu === '3') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating >= 3.0 && a.rating < 4.0);
    } else if (submenu === '2') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating >= 2.0 && a.rating < 3.0);
    } else if (submenu === '1') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating >= 1.0 && a.rating < 2.0);
    } else if (submenu === '0') {
      filtered = animeData.filter(a => a.category === 'rated' && a.rating >= 0.5 && a.rating < 1.0);
    } else if (submenu === 'watchlist') {
      filtered = animeData.filter(a => a.category === 'watchlist');
    } else if (submenu === 'pass') {
      filtered = animeData.filter(a => a.category === 'pass');
    }

    setDisplayedAnime(filtered);
  };

  // 캐릭터 서브메뉴 필터링
  const filterCharactersBySubMenu = (charactersData, submenu) => {
    let filtered = [];

    if (submenu === 'all') {
      // 모두 선택 시 모든 항목 포함
      filtered = charactersData;
    } else if (submenu === '5') {
      // RATED 상태이고 rating이 5.0인 것만
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating === 5.0);
    } else if (submenu === '4') {
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating >= 4.0 && c.rating < 5.0);
    } else if (submenu === '3') {
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating >= 3.0 && c.rating < 4.0);
    } else if (submenu === '2') {
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating >= 2.0 && c.rating < 3.0);
    } else if (submenu === '1') {
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating >= 1.0 && c.rating < 2.0);
    } else if (submenu === '0') {
      filtered = charactersData.filter(c => c.status === 'RATED' && c.rating >= 0.5 && c.rating < 1.0);
    } else if (submenu === 'want') {
      filtered = charactersData.filter(c => c.status === 'WANT_TO_KNOW');
    } else if (submenu === 'pass') {
      filtered = charactersData.filter(c => c.status === 'PASS');
    }

    setDisplayedCharacters(filtered);
  };

  // 서브메뉴 변경 시 필터링
  useEffect(() => {
    if (activeTab === 'anime' && allAnime.length > 0) {
      filterAnimeBySubMenu(allAnime, animeSubMenu);
    }
  }, [animeSubMenu, allAnime]);

  useEffect(() => {
    if (activeTab === 'character' && allCharacters.length > 0) {
      filterCharactersBySubMenu(allCharacters, characterSubMenu);
    }
  }, [characterSubMenu, allCharacters]);

  const loadData = async () => {
    try {
      // 다른 사용자의 프로필을 볼 때는 anipass 탭은 표시 안함
      if (!isOwnProfile && activeTab === 'anipass') {
        return;
      }

      // 이미 로드한 탭이면 스킵 (anipass와 feed는 항상 새로 로드)
      if (loadedTabs[activeTab] && activeTab !== 'anipass' && activeTab !== 'feed') {
        return;
      }

      // Only show full loading screen on initial load
      if (!stats && isOwnProfile) {
        setLoading(true);
      } else if (!profileUser && !isOwnProfile) {
        setLoading(true);
      } else {
        setTabLoading(true);
      }

      // 내 프로필일 때는 stats 로드
      if (!stats && isOwnProfile) {
        const statsData = await userService.getStats();
        setStats(statsData);
      }

      // 다른 사용자 프로필 정보 로드
      if (!isOwnProfile && !profileUser) {
        const targetUserId = parseInt(userId);
        const [profileData, genrePrefs] = await Promise.all([
          userService.getUserProfile(targetUserId).catch(() => null),
          userService.getUserGenrePreferences(targetUserId).catch(() => [])
        ]);
        if (profileData) {
          setProfileUser(profileData.user); // user 객체 설정
          setStats(profileData.stats); // stats 객체 설정
        }
        setGenrePreferences(genrePrefs);
      }

      if (activeTab === 'anipass') {
        const [
          statsData,
          genreData,
          watchTimeData,
          ratingDist,
          yearDist,
          formatDist,
          episodeDist,
          ratingStat,
          studioDist,
          seasonDist,
          genreCombo
        ] = await Promise.all([
          userService.getStats(),
          userService.getGenrePreferences().catch(() => []),
          userService.getWatchTime().catch(() => ({ total_minutes: 0 })),
          userService.getRatingDistribution().catch(() => []),
          userService.getYearDistribution().catch(() => []),
          userService.getFormatDistribution().catch(() => []),
          userService.getEpisodeLengthDistribution().catch(() => []),
          userService.getRatingStats().catch(() => null),
          userService.getStudioStats().catch(() => []),
          userService.getSeasonStats().catch(() => []),
          userService.getGenreCombinations().catch(() => []),
        ]);
        setStats(statsData);
        setGenrePreferences(genreData);
        setWatchTime(watchTimeData);
        setRatingDistribution(ratingDist);
        setYearDistribution(yearDist);
        setFormatDistribution(formatDist);
        setEpisodeLengthDistribution(episodeDist);
        setRatingStats(ratingStat);
        setStudioStats(studioDist);
        setSeasonStats(seasonDist);
        setGenreCombinations(genreCombo);
      } else if (activeTab === 'anime') {
        // Load all anime (rated, watchlist, pass) - Single API call for 3x speed!
        const targetUserId = isOwnProfile ? null : parseInt(userId);
        const allRatingsData = isOwnProfile
          ? await ratingService.getAllMyRatings()
          : await ratingService.getAllUserRatings(targetUserId);

        const allAnimeData = [
          ...(allRatingsData.rated || []).map(item => ({ ...item, category: 'rated' })),
          ...(allRatingsData.watchlist || []).map(item => ({ ...item, category: 'watchlist' })),
          ...(allRatingsData.pass || []).map(item => ({ ...item, category: 'pass' }))
        ];

        setAllAnime(allAnimeData);
        setAllRatedAnime(allRatingsData.rated || []);
        setWatchlistAnime(allRatingsData.watchlist || []);
        setPassAnime(allRatingsData.pass || []);

        // Update stats with average rating and counts for immediate display
        setStats(prev => ({
          ...prev,
          average_rating: allRatingsData.average_rating,
          total_rated: allRatingsData.total_rated || 0,
          total_want_to_watch: allRatingsData.total_watchlist || 0,
          total_pass: allRatingsData.total_pass || 0
        }));

        // Apply initial filter
        filterAnimeBySubMenu(allAnimeData, animeSubMenu);
        setLoadedTabs(prev => ({ ...prev, anime: true }));
      } else if (activeTab === 'character') {
        // Load all character ratings (rated, want to know, pass)
        const targetUserId = isOwnProfile ? null : parseInt(userId);
        const allCharactersData = isOwnProfile
          ? await userService.getCharacterRatings({ limit: 500 })
          : await userService.getUserCharacterRatings(targetUserId, { limit: 500 });

        // Separate by status - similar to anime logic
        const ratedChars = (allCharactersData || []).filter(c => c.status === 'RATED' && c.rating);
        const wantChars = (allCharactersData || []).filter(c => c.status === 'WANT_TO_KNOW');
        const passChars = (allCharactersData || []).filter(c => c.status === 'PASS');

        setAllCharacters(allCharactersData || []);
        setAllRatedCharacters(ratedChars);
        setWantCharacters(wantChars);
        setPassCharacters(passChars);

        // Apply initial filter
        filterCharactersBySubMenu(allCharactersData || [], characterSubMenu);
        setLoadedTabs(prev => ({ ...prev, character: true }));
      } else if (activeTab === 'feed') {
        try {
          const targetUserId = userId || user?.id;
          const feedData = await feedService.getUserFeed(targetUserId, 10, 0);
          setUserActivities(feedData || []);
          setFeedOffset(10);
          setHasMoreFeed(feedData && feedData.length === 10);

          // Initialize likes and comments state
          const likesState = {};
          const commentsState = {};
          (feedData || []).forEach(activity => {
            const key = `${activity.activity_type}_${activity.user_id}_${activity.item_id}`;
            likesState[key] = {
              count: activity.likes_count || 0,
              liked: Boolean(activity.user_has_liked)
            };
            commentsState[key] = [];
          });
          setActivityLikes(likesState);
          setComments(commentsState);
          setExpandedComments(new Set());

          setLoadedTabs(prev => ({ ...prev, feed: true }));
        } catch (error) {
          console.error('Failed to load feed:', error);
          setUserActivities([]);
          setFeedOffset(0);
          setHasMoreFeed(false);
          setLoadedTabs(prev => ({ ...prev, feed: true }));
        }

        // 로딩 완료 (댓글은 사용자가 클릭할 때만 로드)
        setLoading(false);
        setTabLoading(false);
        return;
      }

      setLoading(false);
      setTabLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
      setTabLoading(false);
    }
  };

  const formatWatchTime = (minutes) => {
    if (!minutes) return '0시간';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}분`;
    if (mins === 0) return `${hours}시간`;
    return `${hours}시간 ${mins}분`;
  };

  // Wrapper for avatar URL helper
  const getAvatarUrl = (avatarUrl) => {
    return getAvatarUrlHelper(avatarUrl) || '/placeholder-avatar.png';
  };

  // Helper for anime cover images
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '/placeholder-anime.svg';
    if (imageUrl.startsWith('http')) return imageUrl;
    const processedUrl = imageUrl.includes('/covers/')
      ? imageUrl.replace('/covers/', '/covers_large/')
      : imageUrl;
    return `${IMAGE_BASE_URL}${processedUrl}`;
  };

  const getActivityText = (activity) => {
    const displayName = activity.display_name || activity.username;

    switch (activity.activity_type) {
      case 'anime_rating':
        return language === 'ko' ? `${displayName}님이 평가했어요` : `${displayName} rated an anime`;
      case 'character_rating':
        return language === 'ko' ? `${displayName}님이 캐릭터를 평가했어요` : `${displayName} rated a character`;
      case 'review':
        return language === 'ko' ? `${displayName}님이 리뷰를 남겼어요` : `${displayName} left a review`;
      default:
        return language === 'ko' ? `${displayName}님의 활동` : `${displayName}'s activity`;
    }
  };

  const getActivityIcon = (activityType) => {
    switch (activityType) {
      case 'anime_rating':
        return '⭐';
      case 'character_rating':
        return '👤';
      case 'review':
        return '✍️';
      default:
        return '📝';
    }
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    // SQLite timestamp를 UTC로 파싱
    const activityTime = new Date(timestamp.endsWith('Z') ? timestamp : timestamp + 'Z');
    const diff = now - activityTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (language === 'ko') {
      if (minutes < 60) return `${Math.max(1, minutes)}분 전`;
      if (hours < 24) return `${hours}시간 전`;
      if (days < 7) return `${days}일 전`;
      return activityTime.toLocaleDateString('ko-KR');
    } else {
      if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return activityTime.toLocaleDateString('en-US');
    }
  };

  const getActivityKey = (activity) => {
    return `${activity.activity_type}_${activity.user_id}_${activity.item_id}`;
  };

  const toggleComments = async (activity) => {
    const key = getActivityKey(activity);

    if (expandedComments.has(key)) {
      setExpandedComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    } else {
      setExpandedComments(prev => new Set(prev).add(key));
      await loadComments(activity);
    }
  };

  const loadMoreFeed = async () => {
    if (loadingMoreFeed || !hasMoreFeed) return;

    try {
      setLoadingMoreFeed(true);
      const targetUserId = userId || user?.id;
      const feedData = await feedService.getUserFeed(targetUserId, 50, feedOffset);

      if (feedData && feedData.length > 0) {
        setUserActivities(prev => [...prev, ...feedData]);
        setFeedOffset(prev => prev + feedData.length);
        setHasMoreFeed(feedData.length === 50);

        // Add likes and comments state for new activities
        const likesState = {};
        const commentsState = {};
        feedData.forEach(activity => {
          const key = `${activity.activity_type}_${activity.user_id}_${activity.item_id}`;
          likesState[key] = {
            count: activity.likes_count || 0,
            liked: Boolean(activity.user_has_liked)
          };
          commentsState[key] = [];
        });
        setActivityLikes(prev => ({ ...prev, ...likesState }));
        setComments(prev => ({ ...prev, ...commentsState }));
      } else {
        setHasMoreFeed(false);
      }
    } catch (err) {
      console.error('Failed to load more feed:', err);
    } finally {
      setLoadingMoreFeed(false);
    }
  };

  const loadComments = async (activity) => {
    try {
      const key = getActivityKey(activity);
      const data = await ActivityUtils.loadComments(activity);

      // Initialize comment likes
      const likes = {};
      data.items?.forEach(comment => {
        likes[comment.id] = {
          count: comment.likes_count || 0,
          liked: Boolean(comment.user_liked)
        };
        // Also for replies
        comment.replies?.forEach(reply => {
          likes[reply.id] = {
            count: reply.likes_count || 0,
            liked: Boolean(reply.user_liked)
          };
        });
      });
      setCommentLikes(prev => ({ ...prev, ...likes }));
      setComments(prev => ({ ...prev, [key]: data.items || [] }));
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  };

  // 활동의 댓글 수를 업데이트하는 헬퍼 함수
  const updateActivityCommentsCount = (activity, delta) => {
    setUserActivities(prev => prev.map(act => {
      const actKey = getActivityKey(act);
      const targetKey = getActivityKey(activity);
      if (actKey === targetKey) {
        return {
          ...act,
          comments_count: Math.max(0, (act.comments_count || 0) + delta)
        };
      }
      return act;
    }));
  };

  const handleSubmitComment = async (activity, parentCommentId = null) => {
    const key = getActivityKey(activity);
    const text = parentCommentId ? newCommentText[`${key}-${parentCommentId}`] : newCommentText[key];

    console.log('[MyAniPass] handleSubmitComment called', { activity, parentCommentId, text, key });

    if (!text?.trim()) {
      console.log('[MyAniPass] No text to submit');
      return;
    }

    try {
      if (parentCommentId) {
        console.log('[MyAniPass] Creating reply...');
        await ActivityUtils.createReply(activity, parentCommentId, text);
      } else {
        console.log('[MyAniPass] Creating comment...');
        await ActivityUtils.createComment(activity, text);
      }
      console.log('[MyAniPass] Comment/reply created successfully');

      // Clear input
      if (parentCommentId) {
        setNewCommentText(prev => ({ ...prev, [`${key}-${parentCommentId}`]: '' }));
        setReplyingTo(prev => ({ ...prev, [parentCommentId]: false }));
      } else {
        setNewCommentText(prev => ({ ...prev, [key]: '' }));
      }

      // Reload comments
      console.log('[MyAniPass] Reloading comments...');
      await loadComments(activity);
      updateActivityCommentsCount(activity, 1);
      console.log('[MyAniPass] Comments reloaded and count updated');
    } catch (err) {
      console.error('[MyAniPass] Failed to submit comment:', err);
      alert(language === 'ko' ? `댓글 작성에 실패했습니다: ${err.message}` : `Failed to post comment: ${err.message}`);
    }
  };

  const handleToggleActivityLike = async (activity) => {
    try {
      const result = await activityLikeService.toggleLike(
        activity.activity_type,
        activity.user_id,
        activity.item_id
      );
      const key = getActivityKey(activity);
      setActivityLikes(prev => ({
        ...prev,
        [key]: { liked: result.liked, count: result.like_count }
      }));
    } catch (err) {
      console.error('Failed to toggle activity like:', err);
    }
  };

  const handleToggleCommentLike = async (commentId) => {
    try {
      const result = await commentLikeService.toggleLike(commentId);
      setCommentLikes(prev => ({
        ...prev,
        [commentId]: { liked: result.liked, count: result.like_count }
      }));
    } catch (err) {
      console.error('Failed to toggle comment like:', err);
    }
  };

  const handleReplyClick = (commentId) => {
    setReplyingTo(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const handleSubmitReply = async (activity, parentCommentId) => {
    const key = getActivityKey(activity);
    const text = replyText[parentCommentId];

    if (!text?.trim()) return;

    try {
      await ActivityUtils.createReply(activity, parentCommentId, text);

      setReplyText(prev => ({ ...prev, [parentCommentId]: '' }));
      setReplyingTo(prev => ({ ...prev, [parentCommentId]: false }));
      await loadComments(activity);
      updateActivityCommentsCount(activity, 1);
    } catch (err) {
      console.error('Failed to submit reply:', err);
      alert(language === 'ko' ? '답글 작성에 실패했습니다.' : 'Failed to post reply.');
    }
  };

  const handleDeleteComment = async (activity, commentId) => {
    if (!confirm(language === 'ko' ? '댓글을 삭제하시겠습니까?' : 'Delete this comment?')) return;

    try {
      await ActivityUtils.deleteComment(activity, commentId);
      await loadComments(activity);
      updateActivityCommentsCount(activity, -1);
    } catch (err) {
      console.error('Failed to delete comment:', err);
      alert(language === 'ko' ? '댓글 삭제에 실패했습니다.' : 'Failed to delete comment.');
    }
  };

  const handleAvatarError = (e, userId) => {
    if (failedImages.has(`avatar-${userId}`)) return;
    setFailedImages(prev => new Set(prev).add(`avatar-${userId}`));
    e.target.src = '/placeholder-avatar.png';
  };

  const handleImageError = (e, itemId) => {
    if (failedImages.has(`image-${itemId}`)) return;
    setFailedImages(prev => new Set(prev).add(`image-${itemId}`));
    e.target.src = '/placeholder-anime.svg';
  };

  const handleCreatePost = async () => {
    if (!newPostContent || !newPostContent.trim()) return;

    try {
      await userPostService.createPost(newPostContent);
      setNewPostContent('');
      // Reload feed data (최신 10개만)
      const targetUserId = userId || user?.id;
      const feedData = await feedService.getUserFeed(targetUserId, 10, 0);
      setUserActivities(feedData || []);
      setFeedOffset(10);
      setHasMoreFeed(feedData && feedData.length === 10);

      // Reinitialize likes and comments state
      const likesState = {};
      const commentsState = {};
      feedData.forEach(activity => {
        const key = `${activity.activity_type}_${activity.user_id}_${activity.item_id}`;
        likesState[key] = {
          count: activity.likes_count || 0,
          liked: Boolean(activity.user_has_liked)
        };
        commentsState[key] = [];
      });
      setActivityLikes(likesState);
      setComments(commentsState);
      setExpandedComments(new Set());
    } catch (err) {
      console.error('Failed to create post:', err);
      alert(language === 'ko' ? '게시물 작성에 실패했습니다.' : 'Failed to create post.');
    }
  };

  const renderAnimeCard = (anime) => {
    const title = anime.title_korean || anime.title_romaji || anime.title_english || 'Unknown';
    const imageUrl = anime.image_url;

    return (
      <Link
        key={anime.anime_id}
        to={`/anime/${anime.anime_id}`}
        className="group"
      >
        <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300">
          <div className="relative aspect-[3/4] bg-gray-200">
            <img
              src={getImageUrl(imageUrl)}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = '/placeholder-anime.svg';
              }}
            />
          </div>
          <div className="p-3">
            <h3 className="font-medium text-sm mb-1 line-clamp-2">
              {title}
            </h3>
            {anime.rating && (
              <StarRating rating={anime.rating} readonly size="sm" />
            )}
          </div>
        </div>
      </Link>
    );
  };

  // 평점별로 그룹화 (애니용)
  const groupAnimeByCategory = (items) => {
    const groups = {
      '5': items.filter(item => item.category === 'rated' && item.rating === 5.0),
      '4': items.filter(item => item.category === 'rated' && item.rating >= 4.0 && item.rating < 5.0),
      '3': items.filter(item => item.category === 'rated' && item.rating >= 3.0 && item.rating < 4.0),
      '2': items.filter(item => item.category === 'rated' && item.rating >= 2.0 && item.rating < 3.0),
      '1': items.filter(item => item.category === 'rated' && item.rating >= 1.0 && item.rating < 2.0),
      '0': items.filter(item => item.category === 'rated' && item.rating >= 0.5 && item.rating < 1.0),
      'watchlist': items.filter(item => item.category === 'watchlist'),
      'pass': items.filter(item => item.category === 'pass')
    };
    return groups;
  };

  // 평점별로 그룹화 (캐릭터용)
  const groupCharactersByCategory = (items) => {
    const groups = {
      '5': items.filter(item => item.rating === 5.0),
      '4': items.filter(item => item.rating >= 4.0 && item.rating < 5.0),
      '3': items.filter(item => item.rating >= 3.0 && item.rating < 4.0),
      '2': items.filter(item => item.rating >= 2.0 && item.rating < 3.0),
      '1': items.filter(item => item.rating >= 1.0 && item.rating < 2.0),
      '0': items.filter(item => item.rating >= 0.5 && item.rating < 1.0),
      'want': items.filter(item => item.status === 'WANT_TO_KNOW'),
      'pass': items.filter(item => item.status === 'PASS')
    };
    return groups;
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-0 md:pt-16 bg-transparent">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          {/* Header with Real User Data */}
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-6 mb-8">
            <div className="flex items-center gap-4 mb-6">
              {/* Real Avatar */}
              {displayUser?.avatar_url ? (
                <img
                  src={getAvatarUrl(displayUser.avatar_url)}
                  alt={displayUser.display_name || displayUser.username}
                  className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold border-2 border-gray-200" style={{ background: getAvatarGradient(displayUser?.username) }}>
                  {(displayUser?.display_name || displayUser?.username || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                {/* Real Name */}
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold">
                    {displayUser?.display_name || displayUser?.username}
                  </h1>
                </div>
                {/* Real Follow Counts */}
                <div className="flex items-center gap-4 mb-2">
                  <button
                    onClick={() => openFollowModal('followers')}
                    className="text-sm hover:text-[#737373] transition-colors"
                  >
                    <span className="font-bold">{followCounts.followers_count}</span> {language === 'ko' ? '팔로워' : 'Followers'}
                  </button>
                  <button
                    onClick={() => openFollowModal('following')}
                    className="text-sm hover:text-[#737373] transition-colors"
                  >
                    <span className="font-bold">{followCounts.following_count}</span> {language === 'ko' ? '팔로잉' : 'Following'}
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs - Real and Clickable */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('feed')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'feed'
                    ? 'border-b-2'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                style={activeTab === 'feed' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
              >
                {language === 'ko' ? '피드' : 'Feed'}
              </button>
              {isOwnProfile && (
                <button
                  onClick={() => setActiveTab('anipass')}
                  className={`px-6 py-3 font-medium transition-colors ${
                    activeTab === 'anipass'
                      ? 'border-b-2'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  style={activeTab === 'anipass' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
                >
                  {language === 'ko' ? '애니패스' : 'AniPass'}
                </button>
              )}
              <button
                onClick={() => setActiveTab('anime')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'anime'
                    ? 'border-b-2'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                style={activeTab === 'anime' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
              >
                {language === 'ko' ? '애니' : 'Anime'}
              </button>
              <button
                onClick={() => setActiveTab('character')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'character'
                    ? 'border-b-2'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                style={activeTab === 'character' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
              >
                {language === 'ko' ? '캐릭터' : 'Character'}
              </button>
            </div>
          </div>

          {/* Content Area Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-6 animate-pulse">
                <div className="h-6 w-32 bg-gray-200 rounded mb-4"></div>
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-0 md:pt-16 bg-transparent">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-6 mb-8">
          <div className="flex items-center gap-4 mb-6">
            {displayUser?.avatar_url ? (
              <img
                src={getAvatarUrl(displayUser.avatar_url)}
                alt={displayUser.display_name || displayUser.username}
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold border-2 border-gray-200" style={{ background: getAvatarGradient(displayUser?.username) }}>
                {(displayUser?.display_name || displayUser?.username || 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">
                  {displayUser?.display_name || displayUser?.username}
                </h1>
                {stats && (
                  (() => {
                    const levelInfo = getCurrentLevelInfo(stats.otaku_score || 0);
                    return (
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${levelInfo.bgGradient} border ${levelInfo.borderColor}`}>
                        <span style={{ color: levelInfo.color }} className="font-bold">{levelInfo.icon}</span> <span className="text-gray-700">{levelInfo.level} - {toRoman(levelInfo.rank)}</span>
                      </span>
                    );
                  })()
                )}
              </div>
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={() => openFollowModal('followers')}
                  className="text-sm hover:text-[#737373] transition-colors"
                >
                  <span className="font-bold">{followCounts.followers_count}</span> {language === 'ko' ? '팔로워' : 'Followers'}
                </button>
                <button
                  onClick={() => openFollowModal('following')}
                  className="text-sm hover:text-[#737373] transition-colors"
                >
                  <span className="font-bold">{followCounts.following_count}</span> {language === 'ko' ? '팔로잉' : 'Following'}
                </button>
              </div>
            </div>
            {!isOwnProfile && (
              <button
                onClick={handleFollowToggle}
                className={`ml-auto px-4 py-2 rounded-lg font-medium transition-colors ${
                  isFollowing
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'text-white'
                }`}
                style={!isFollowing ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                onMouseEnter={(e) => !isFollowing && (e.target.style.backgroundColor = '#1877F2')}
                onMouseLeave={(e) => !isFollowing && (e.target.style.backgroundColor = '#3797F0')}
              >
                {isFollowing ? (language === 'ko' ? '언팔로우' : 'Unfollow') : (language === 'ko' ? '팔로우' : 'Follow')}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('feed')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'feed'
                  ? 'border-b-2'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              style={activeTab === 'feed' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
            >
              {language === 'ko' ? '피드' : 'Feed'}
            </button>
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab('anipass')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'anipass'
                    ? 'border-b-2'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                style={activeTab === 'anipass' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
              >
                {language === 'ko' ? '애니패스' : 'AniPass'}
              </button>
            )}
            <button
              onClick={() => setActiveTab('anime')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'anime'
                  ? 'border-b-2'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              style={activeTab === 'anime' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
            >
              {language === 'ko' ? '애니' : 'Anime'} {stats && <span className="text-sm">({(stats.total_rated || 0) + (stats.total_want_to_watch || 0) + (stats.total_pass || 0)})</span>}
            </button>
            <button
              onClick={() => setActiveTab('character')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'character'
                  ? 'border-b-2'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              style={activeTab === 'character' ? { color: '#000000', borderColor: '#000000', fontWeight: '600' } : {}}
            >
              {language === 'ko' ? '캐릭터' : 'Character'} {stats && <span className="text-sm">({stats.total_character_ratings || 0})</span>}
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-gray-600">{language === 'ko' ? '로딩 중...' : 'Loading...'}</div>
          </div>
        ) : (
          <div className={tabLoading ? 'opacity-50 pointer-events-none' : ''}>
            {activeTab === 'anipass' && (
              <div className="space-y-6">
                {/* 상단 그리드: 오타쿠 미터, 통계, 장르 선호도 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* 오타쿠 미터 */}
                  <div className="lg:col-span-1">
                    {stats && <OtakuMeter score={stats.otaku_score || 0} />}
                  </div>

                  {/* 통계 */}
                  <div className="lg:col-span-1">
                    {stats && (
                      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-6 h-full">
                        <h3 className="text-lg font-bold mb-4 text-gray-800">{language === 'ko' ? '통계' : 'Statistics'}</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'linear-gradient(to bottom right, #F7F7F7, #EFEFEF)' }}>
                            <div className="flex-1">
                              <div className="text-xs text-gray-600 mb-0.5">{language === 'ko' ? '평가한 애니' : 'Rated Anime'}</div>
                              <div className="text-xl font-bold" style={{ color: '#000000' }}>
                                {stats.total_rated || 0}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'linear-gradient(to bottom right, #FAFAFA, #F5F5F5)' }}>
                            <div className="flex-1">
                              <div className="text-xs text-gray-600 mb-0.5">{language === 'ko' ? '보고싶어요' : 'Watchlist'}</div>
                              <div className="text-xl font-bold" style={{ color: '#737373' }}>
                                {stats.total_want_to_watch || 0}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'linear-gradient(to bottom right, #F7F7F7, #EFEFEF)' }}>
                            <div className="flex-1">
                              <div className="text-xs text-gray-600 mb-0.5">{language === 'ko' ? '평균 평점' : 'Avg Rating'}</div>
                              <div className="text-xl font-bold" style={{ color: '#000000' }}>
                                {stats.average_rating ? `★ ${stats.average_rating.toFixed(1)}` : '-'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'linear-gradient(to bottom right, #FAFAFA, #F5F5F5)' }}>
                            <div className="flex-1">
                              <div className="text-xs text-gray-600 mb-0.5">{language === 'ko' ? '시청 시간' : 'Watch Time'}</div>
                              <div className="text-xl font-bold" style={{ color: '#737373' }}>
                                {formatWatchTime(watchTime?.total_minutes)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 장르 선호도 */}
                  <div className="lg:col-span-1">
                    <GenrePreferences preferences={genrePreferences} />
                  </div>
                </div>

                {/* Phase 1 통계 그리드: 포맷, 에피소드 길이, 평가 성향 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <FormatDistribution distribution={formatDistribution} />
                  <EpisodeLengthChart distribution={episodeLengthDistribution} />
                  <RatingStatsCard stats={ratingStats} />
                </div>

                {/* 차트 그리드: 평점 분포, 연도별 분포 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <RatingDistributionChart distribution={ratingDistribution} />
                  <YearDistributionChart distribution={yearDistribution} />
                </div>

                {/* Phase 1 & 2 추가 통계: 스튜디오, 장르 조합, 시즌 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <StudioStats studios={studioStats} />
                  <GenreCombinationChart combinations={genreCombinations} />
                  <SeasonStats seasons={seasonStats} />
                </div>
              </div>
            )}

            {activeTab === 'anime' && (
              <div>
                {/* Sub-menu */}
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setAnimeSubMenu('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === 'all'
                          ? ''
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === 'all' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '모두' : 'All'} ({allRatedAnime.length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('5')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '5'
                          ? ''
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '5' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 5{language === 'ko' ? '점' : ''} ({allRatedAnime.filter(a => a.rating === 5.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('4')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '4'
                          ? ''
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '4' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 4{language === 'ko' ? '점대' : ''} ({allRatedAnime.filter(a => a.rating >= 4.0 && a.rating < 5.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('3')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '3'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '3' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 3{language === 'ko' ? '점대' : ''} ({allRatedAnime.filter(a => a.rating >= 3.0 && a.rating < 4.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('2')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '2'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '2' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 2{language === 'ko' ? '점대' : ''} ({allRatedAnime.filter(a => a.rating >= 2.0 && a.rating < 3.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('1')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '1'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '1' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 1{language === 'ko' ? '점대' : ''} ({allRatedAnime.filter(a => a.rating >= 1.0 && a.rating < 2.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('0')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === '0'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === '0' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 0{language === 'ko' ? '점대' : ''} ({allRatedAnime.filter(a => a.rating >= 0.5 && a.rating < 1.0).length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('watchlist')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === 'watchlist'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === 'watchlist' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '보고싶어요' : 'Watchlist'} ({watchlistAnime.length})
                    </button>
                    <button
                      onClick={() => setAnimeSubMenu('pass')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        animeSubMenu === 'pass'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={animeSubMenu === 'pass' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '관심없어요' : 'Pass'} ({passAnime.length})
                    </button>
                  </div>
                </div>

                {/* Anime Grid */}
                {displayedAnime.length > 0 ? (
                  animeSubMenu === 'all' ? (
                    // 모두 선택 시 평점별로 그룹화
                    <div className="space-y-8">
                      {(() => {
                        const groups = groupAnimeByCategory(displayedAnime);
                        const categoryOrder = ['5', '4', '3', '2', '1', '0', 'watchlist', 'pass'];
                        const categoryLabels = {
                          '5': language === 'ko' ? '⭐ 5점' : '⭐ 5 Stars',
                          '4': language === 'ko' ? '⭐ 4점대' : '⭐ 4.0-4.9',
                          '3': language === 'ko' ? '⭐ 3점대' : '⭐ 3.0-3.9',
                          '2': language === 'ko' ? '⭐ 2점대' : '⭐ 2.0-2.9',
                          '1': language === 'ko' ? '⭐ 1점대' : '⭐ 1.0-1.9',
                          '0': language === 'ko' ? '⭐ 0점대' : '⭐ 0.5-0.9',
                          'watchlist': language === 'ko' ? '📋 보고싶어요' : '📋 Watchlist',
                          'pass': language === 'ko' ? '🚫 관심없어요' : '🚫 Pass'
                        };

                        let sectionIndex = 0;
                        return categoryOrder.map((category) => {
                          if (groups[category].length === 0) return null;

                          const section = (
                            <div key={category}>
                              {sectionIndex > 0 && <div className="border-t-2 border-gray-300 my-6"></div>}
                              <h3 className="text-lg font-bold mb-4 text-gray-800">
                                {categoryLabels[category]} ({groups[category].length})
                              </h3>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {groups[category].map(renderAnimeCard)}
                              </div>
                            </div>
                          );
                          sectionIndex++;
                          return section;
                        }).filter(Boolean);
                      })()}
                    </div>
                  ) : (
                    // 특정 필터 선택 시
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                      {displayedAnime.map(renderAnimeCard)}
                    </div>
                  )
                ) : (
                  <div className="text-center py-12 text-gray-600">
                    {language === 'ko' ? '아직 애니가 없습니다.' : 'No anime yet.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'character' && (
              <div>
                {/* Sub-menu */}
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setCharacterSubMenu('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === 'all'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === 'all' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '모두' : 'All'} ({allCharacters.length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('5')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '5'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '5' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 5{language === 'ko' ? '점' : ''} ({allRatedCharacters.filter(c => c.rating === 5.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('4')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '4'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '4' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 4{language === 'ko' ? '점대' : ''} ({allRatedCharacters.filter(c => c.rating >= 4.0 && c.rating < 5.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('3')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '3'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '3' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 3{language === 'ko' ? '점대' : ''} ({allRatedCharacters.filter(c => c.rating >= 3.0 && c.rating < 4.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('2')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '2'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '2' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 2{language === 'ko' ? '점대' : ''} ({allRatedCharacters.filter(c => c.rating >= 2.0 && c.rating < 3.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('1')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '1'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '1' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 1{language === 'ko' ? '점대' : ''} ({allRatedCharacters.filter(c => c.rating >= 1.0 && c.rating < 2.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('0')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === '0'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === '0' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      ⭐ 0{language === 'ko' ? '점대' : ''} ({allRatedCharacters.filter(c => c.rating >= 0.5 && c.rating < 1.0).length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('want')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === 'want'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === 'want' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '알고싶어요' : 'Want to Know'} ({wantCharacters.length})
                    </button>
                    <button
                      onClick={() => setCharacterSubMenu('pass')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        characterSubMenu === 'pass'
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={characterSubMenu === 'pass' ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                    >
                      {language === 'ko' ? '관심없어요' : 'Pass'} ({passCharacters.length})
                    </button>
                  </div>
                </div>

                {/* Character Grid */}
                {displayedCharacters.length > 0 ? (
                  characterSubMenu === 'all' ? (
                    // 모두 선택 시 평점별로 그룹화
                    <div className="space-y-8">
                      {(() => {
                        const groups = groupCharactersByCategory(displayedCharacters);
                        const categoryOrder = ['5', '4', '3', '2', '1', '0', 'want', 'pass'];
                        const categoryLabels = {
                          '5': language === 'ko' ? '⭐ 5점' : '⭐ 5 Stars',
                          '4': language === 'ko' ? '⭐ 4점대' : '⭐ 4.0-4.9',
                          '3': language === 'ko' ? '⭐ 3점대' : '⭐ 3.0-3.9',
                          '2': language === 'ko' ? '⭐ 2점대' : '⭐ 2.0-2.9',
                          '1': language === 'ko' ? '⭐ 1점대' : '⭐ 1.0-1.9',
                          '0': language === 'ko' ? '⭐ 0점대' : '⭐ 0.5-0.9',
                          'want': language === 'ko' ? '💭 알고싶어요' : '💭 Want to Know',
                          'pass': language === 'ko' ? '🚫 관심없어요' : '🚫 Pass'
                        };

                        let sectionIndex = 0;
                        return categoryOrder.map((category) => {
                          if (groups[category].length === 0) return null;

                          const section = (
                            <div key={category}>
                              {sectionIndex > 0 && <div className="border-t-2 border-gray-300 my-6"></div>}
                              <h3 className="text-lg font-bold mb-4 text-gray-800">
                                {categoryLabels[category]} ({groups[category].length})
                              </h3>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {groups[category].map((character) => {
                                  // 영어 이름 우선
                                  const name = character.character_name || character.character_name_native || '';

                                  return (
                                    <Link
                                      key={character.character_id}
                                      to={`/character/${character.character_id}`}
                                      className="group"
                                    >
                                      <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300">
                                        <div className="relative aspect-[3/4] bg-gray-200">
                                          <img
                                            src={getCharacterImageUrl(character.character_id, character.image_url)}
                                            alt={name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              // R2 실패 시 외부 URL로 fallback
                                              if (!e.target.dataset.fallbackAttempted) {
                                                e.target.dataset.fallbackAttempted = 'true';
                                                const fallbackUrl = getCharacterImageFallback(character.image_url);
                                                e.target.src = fallbackUrl;
                                              } else {
                                                e.target.src = '/placeholder-character.png';
                                              }
                                            }}
                                          />
                                        </div>
                                        <div className="p-3">
                                          <h3 className="font-medium text-sm mb-1 line-clamp-2">
                                            {name}
                                          </h3>
                                          {character.rating && (
                                            <StarRating rating={character.rating} readonly size="sm" />
                                          )}
                                          {character.anime_title && (
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                              {language === 'ko' && character.anime_title_korean
                                                ? character.anime_title_korean
                                                : character.anime_title}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                          sectionIndex++;
                          return section;
                        }).filter(Boolean);
                      })()}
                    </div>
                  ) : (
                    // 특정 필터 선택 시
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                      {displayedCharacters.map((character) => {
                        // 영어 이름 우선
                        const name = character.character_name || character.character_name_native || '';

                        return (
                          <Link
                            key={character.character_id}
                            to={`/character/${character.character_id}`}
                            className="group"
                          >
                            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300">
                              <div className="relative aspect-[3/4] bg-gray-200">
                                <img
                                  src={getCharacterImageUrl(character.character_id, character.image_url)}
                                  alt={name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // R2 실패 시 외부 URL로 fallback
                                    if (!e.target.dataset.fallbackAttempted) {
                                      e.target.dataset.fallbackAttempted = 'true';
                                      const fallbackUrl = getCharacterImageFallback(character.image_url);
                                      e.target.src = fallbackUrl;
                                    } else {
                                      e.target.src = '/placeholder-character.png';
                                    }
                                  }}
                                />
                              </div>
                              <div className="p-3">
                                <h3 className="font-medium text-sm mb-1 line-clamp-2">
                                  {name}
                                </h3>
                                {character.rating && (
                                  <StarRating rating={character.rating} readonly size="sm" />
                                )}
                                {character.anime_title && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                    {language === 'ko' && character.anime_title_korean
                                      ? character.anime_title_korean
                                      : character.anime_title}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="text-center py-12 text-gray-600">
                    {language === 'ko' ? '아직 캐릭터가 없습니다.' : 'No characters yet.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'feed' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Sidebar - Profile Summary */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-6 sticky top-4">
                    {/* Profile Picture */}
                    <div className="flex flex-col items-center mb-4">
                      {(profileUser || user)?.avatar_url ? (
                        <img
                          src={getAvatarUrl((profileUser || user).avatar_url)}
                          alt={(profileUser || user)?.display_name || (profileUser || user)?.username}
                          className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 mb-3"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-gray-200 mb-3" style={{ background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)' }}>
                          <span className="text-white text-2xl font-bold">
                            {((profileUser || user)?.display_name || (profileUser || user)?.username || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Name */}
                      <h3 className="text-lg font-bold text-gray-900 text-center">
                        {(profileUser || user)?.display_name || (profileUser || user)?.username}
                      </h3>

                      {/* Badge */}
                      {stats && (() => {
                        const levelInfo = getCurrentLevelInfo(stats.otaku_score);
                        return (
                          <span className={`mt-2 text-sm px-3 py-1 rounded-full font-semibold ${levelInfo.bgGradient} border ${levelInfo.borderColor}`}>
                            <span style={{ color: levelInfo.color }} className="font-bold">{levelInfo.icon}</span> <span className="text-gray-700">{levelInfo.level} - {toRoman(levelInfo.rank)}</span>
                          </span>
                        );
                      })()}
                    </div>

                    {/* Stats Summary */}
                    {stats && (
                      <div className="space-y-3 pt-4 border-t border-gray-200">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{language === 'ko' ? '오타쿠 점수' : 'Otaku Score'}</span>
                          <span className="text-sm font-bold text-gray-900">{Math.round(stats.otaku_score)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{language === 'ko' ? '평가한 애니' : 'Rated Anime'}</span>
                          <span className="text-sm font-bold text-gray-900">{stats.total_rated}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{language === 'ko' ? '평가한 캐릭터' : 'Rated Characters'}</span>
                          <span className="text-sm font-bold text-gray-900">{stats.total_character_ratings || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{language === 'ko' ? '작성한 리뷰' : 'Reviews Written'}</span>
                          <span className="text-sm font-bold text-gray-900">{stats.total_reviews}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{language === 'ko' ? '평균 평점' : 'Avg Rating'}</span>
                          <span className="text-sm font-bold text-gray-900">{stats.average_rating?.toFixed(1) || 'N/A'}</span>
                        </div>
                        {displayUser?.created_at && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{language === 'ko' ? '가입일' : 'Joined'}</span>
                            <span className="text-sm font-bold text-gray-900">
                              {new Date(displayUser.created_at).toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Follow Stats */}
                    <div className="flex gap-4 justify-center pt-4 border-t border-gray-200 mt-4">
                      <button
                        onClick={() => openFollowModal('followers')}
                        className="flex flex-col items-center hover:text-[#737373] transition-colors"
                      >
                        <span className="text-lg font-bold text-gray-900">{followCounts.followers_count}</span>
                        <span className="text-xs text-gray-600">{language === 'ko' ? '팔로워' : 'Followers'}</span>
                      </button>
                      <div className="w-px bg-gray-200"></div>
                      <button
                        onClick={() => openFollowModal('following')}
                        className="flex flex-col items-center hover:text-[#737373] transition-colors"
                      >
                        <span className="text-lg font-bold text-gray-900">{followCounts.following_count}</span>
                        <span className="text-xs text-gray-600">{language === 'ko' ? '팔로잉' : 'Following'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Content - Feed */}
                <div className="lg:col-span-3">
                  {/* Post Composer - Only show for own profile */}
                  {isOwnProfile && (
                    <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-4 mb-6">
                      <div className="flex gap-3">
                        {displayUser?.avatar_url ? (
                          <img
                            src={getAvatarUrl(displayUser.avatar_url)}
                            alt={displayUser.display_name || displayUser.username}
                            className="w-10 h-10 rounded-full object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-200" style={{ background: getAvatarGradient(displayUser?.username) }}>
                            <span className="text-white text-sm font-bold">
                              {(displayUser?.display_name || displayUser?.username || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <textarea
                            value={newPostContent}
                            onChange={(e) => setNewPostContent(e.target.value)}
                            placeholder={language === 'ko' ? '무슨 생각을 하고 계신가요?' : "What's on your mind?"}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows="3"
                          />
                          <div className="flex justify-end mt-2">
                            <button
                              onClick={handleCreatePost}
                              disabled={!newPostContent.trim()}
                              className="px-4 py-2 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                              style={newPostContent.trim() ? { backgroundColor: '#3797F0', color: 'white', fontWeight: '600' } : {}}
                              onMouseEnter={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#1877F2')}
                              onMouseLeave={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#3797F0')}
                            >
                              {language === 'ko' ? '게시' : 'Post'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                  {userActivities.map((activity, index) => {
                    // Use profile user data instead of activity data for avatar/username
                    const currentUser = profileUser || user;
                    const displayAvatar = currentUser?.avatar_url;
                    const displayName = currentUser?.display_name || currentUser?.username;
                    const currentOtakuScore = stats?.otaku_score || 0;
                    const isLastActivity = userActivities.length === index + 1;

                    return (
                      <div
                        key={`${activity.activity_type}-${activity.user_id}-${activity.item_id}-${index}`}
                        ref={isLastActivity ? lastActivityElementRef : null}
                        className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all"
                      >
                        {/* Header - Profile info at the top */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* User Avatar */}
                            <Link to={isOwnProfile ? `/my-anipass` : `/user/${activity.user_id}`} className="flex-shrink-0">
                              {displayAvatar ? (
                                <img
                                  src={getAvatarUrl(displayAvatar)}
                                  alt={displayName}
                                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                  onError={(e) => handleAvatarError(e, activity.user_id)}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200" style={{ background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)' }}>
                                  <span className="text-white text-xs font-bold">
                                    {(displayName || '?').charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </Link>
                            <Link
                              to={isOwnProfile ? `/my-anipass` : `/user/${activity.user_id}`}
                              className="text-base font-medium text-gray-700 hover:text-[#737373] transition-colors"
                            >
                              {displayName}
                            </Link>
                            {(() => {
                              const levelInfo = getCurrentLevelInfo(currentOtakuScore);
                              return (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${levelInfo.bgGradient} border ${levelInfo.borderColor}`}>
                                  <span style={{ color: levelInfo.color }} className="font-bold">{levelInfo.icon}</span> <span className="text-gray-700">{levelInfo.level} - {toRoman(levelInfo.rank)}</span>
                                </span>
                              );
                            })()}
                            {activity.activity_type !== 'user_post' && (
                              <span className="text-sm text-gray-600">
                                {activity.activity_type === 'anime_rating' && (language === 'ko' ? '애니를 평가했어요' : 'rated an anime')}
                                {activity.activity_type === 'character_rating' && (language === 'ko' ? '캐릭터를 평가했어요' : 'rated a character')}
                                {activity.activity_type === 'review' && (language === 'ko' ? '리뷰를 남겼어요' : 'left a review')}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {getTimeAgo(activity.activity_time)}
                          </span>
                        </div>

                        {/* Main Content Wrapper */}
                        <div>
                          {/* Content area - Image and info side by side for non-post activities */}
                          {activity.activity_type !== 'user_post' ? (
                            <div className="flex gap-4">
                              {/* Image */}
                              <Link
                                to={activity.activity_type === 'character_rating' ? `/character/${activity.item_id}` : `/anime/${activity.item_id}`}
                                className="flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                              >
                                <img
                                  src={getImageUrl(activity.item_image)}
                                  alt={activity.item_title}
                                  className="w-16 h-24 object-cover rounded border-2 border-transparent hover:border-[#A8E6CF] transition-all"
                                  onError={(e) => handleImageError(e, activity.item_id)}
                                />
                              </Link>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                {/* Title */}
                                <Link
                                  to={activity.activity_type === 'character_rating' ? `/character/${activity.item_id}` : `/anime/${activity.item_id}`}
                                  className="block group cursor-pointer"
                                >
                                  <h3 className="font-semibold text-gray-900 group-hover:text-[#737373] transition-colors mb-1 group-hover:underline">
                                    {activity.activity_type === 'character_rating' ? (
                                      <>
                                        {activity.item_title}
                                        {activity.item_title_korean && activity.item_title_korean !== activity.item_title && (
                                          <span className="text-sm text-gray-500 ml-2">({activity.item_title_korean})</span>
                                        )}
                                      </>
                                    ) : (
                                      activity.item_title_korean || activity.item_title
                                    )}
                                  </h3>
                                </Link>

                                {/* Anime title for character ratings */}
                                {activity.activity_type === 'character_rating' && activity.anime_title && (
                                  <p className="text-xs text-gray-500 mb-2">
                                    from:{' '}
                                    <Link
                                      to={`/anime/${activity.anime_id}`}
                                      className="hover:text-[#737373] hover:underline transition-colors"
                                    >
                                      {activity.anime_title_korean || activity.anime_title}
                                    </Link>
                                  </p>
                                )}

                                {/* Rating */}
                                {activity.rating && (
                                  <div className="mb-2">
                                    <StarRating rating={activity.rating} readonly size="sm" />
                                  </div>
                                )}

                                {/* Review Content */}
                                {activity.review_content && (
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {activity.review_content}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            // User post content
                            <div>
                              {activity.post_content && (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
                                  {activity.post_content}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Like and Comment Buttons */}
                          <div className="mt-3 flex items-center gap-6">
                            <button
                            onClick={() => handleToggleActivityLike(activity)}
                            className="flex items-center gap-2 transition-all hover:scale-110"
                            style={{
                              color: activityLikes[getActivityKey(activity)]?.liked ? '#DC2626' : '#6B7280'
                            }}
                          >
                            {activityLikes[getActivityKey(activity)]?.liked ? (
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            ) : (
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            )}
                            <span className="text-sm font-medium">
                              {language === 'ko' ? '좋아요' : 'Like'}
                              {activityLikes[getActivityKey(activity)]?.count > 0 && (
                                <> {activityLikes[getActivityKey(activity)].count}</>
                              )}
                            </span>
                          </button>
                          <button
                            onClick={() => toggleComments(activity)}
                            className="flex items-center gap-2 transition-all hover:scale-110"
                            style={{ color: '#6B7280' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#737373';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#6B7280';
                            }}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                            </svg>
                            <span className="text-sm font-medium">
                              {language === 'ko' ? '댓글 달기' : 'Comment'}
                              {activity.comments_count > 0 && (
                                <> {activity.comments_count}</>
                              )}
                            </span>
                            </button>
                          </div>

                          {/* Comments Section */}
                          {expandedComments.has(getActivityKey(activity)) && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                            {/* Comments List */}
                            {comments[getActivityKey(activity)]?.length > 0 && (
                              <div className="space-y-3 mb-3">
                                {comments[getActivityKey(activity)].map((comment) => (
                                  <div key={comment.id} className="space-y-2">
                                    {/* Main Comment */}
                                    <div className="flex gap-2">
                                      {comment.avatar_url ? (
                                        <img
                                          src={getAvatarUrl(comment.avatar_url)}
                                          alt={comment.display_name || comment.username}
                                          className="w-6 h-6 rounded-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: getAvatarGradient(comment.username) }}>
                                          <span className="text-white text-[10px] font-bold">
                                            {(comment.display_name || comment.username || '?')[0].toUpperCase()}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <Link
                                            to={`/user/${comment.user_id}`}
                                            className="text-xs font-medium text-gray-700 hover:text-[#737373]"
                                          >
                                            {comment.display_name || comment.username}
                                          </Link>
                                          <span className="text-[10px] text-gray-400">
                                            {getTimeAgo(comment.created_at)}
                                          </span>
                                          {comment.user_id === user?.id && (
                                            <button
                                              onClick={() => handleDeleteComment(activity, comment.id)}
                                              className="text-[10px] text-red-500 hover:text-red-700"
                                            >
                                              {language === 'ko' ? '삭제' : 'Delete'}
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-xs text-gray-700 mb-1">{comment.content}</p>
                                        <div className="flex items-center gap-3">
                                          <button
                                            onClick={() => handleToggleCommentLike(comment.id)}
                                            className="flex items-center gap-1 transition-all hover:scale-110"
                                            style={{
                                              color: commentLikes[comment.id]?.liked ? '#DC2626' : '#9CA3AF'
                                            }}
                                          >
                                            {commentLikes[comment.id]?.liked ? (
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                              </svg>
                                            ) : (
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                              </svg>
                                            )}
                                            {commentLikes[comment.id]?.count > 0 && (
                                              <span className="text-xs">{commentLikes[comment.id].count}</span>
                                            )}
                                          </button>
                                          <button
                                            onClick={() => handleReplyClick(comment.id)}
                                            className="text-[10px]"
                                            style={{ color: '#9CA3AF' }}
                                            onMouseEnter={(e) => e.target.style.color = '#737373'}
                                            onMouseLeave={(e) => e.target.style.color = '#9CA3AF'}
                                          >
                                            {language === 'ko' ? '답글' : 'Reply'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Replies */}
                                    {comment.replies && comment.replies.length > 0 && (
                                      <div className="ml-12 space-y-2">
                                        {comment.replies.map((reply) => (
                                          <div key={reply.id} className="flex gap-2">
                                            {reply.avatar_url ? (
                                              <img
                                                src={getAvatarUrl(reply.avatar_url)}
                                                alt={reply.display_name || reply.username}
                                                className="w-5 h-5 rounded-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)' }}>
                                                <span className="text-white text-[8px] font-bold">
                                                  {(reply.display_name || reply.username || '?')[0].toUpperCase()}
                                                </span>
                                              </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <Link
                                                  to={`/user/${reply.user_id}`}
                                                  className="text-[10px] font-medium text-gray-700 hover:text-[#737373]"
                                                >
                                                  {reply.display_name || reply.username}
                                                </Link>
                                                <span className="text-[8px] text-gray-400">
                                                  {getTimeAgo(reply.created_at)}
                                                </span>
                                                {reply.user_id === user?.id && (
                                                  <button
                                                    onClick={() => handleDeleteComment(activity, reply.id)}
                                                    className="text-[8px] text-red-500 hover:text-red-700"
                                                  >
                                                    {language === 'ko' ? '삭제' : 'Delete'}
                                                  </button>
                                                )}
                                              </div>
                                              <p className="text-[10px] text-gray-700 mb-1">{reply.content}</p>
                                              <button
                                                onClick={() => handleToggleCommentLike(reply.id)}
                                                className="flex items-center gap-1 transition-all hover:scale-110"
                                                style={{
                                                  color: commentLikes[reply.id]?.liked ? '#DC2626' : '#9CA3AF'
                                                }}
                                              >
                                                {commentLikes[reply.id]?.liked ? (
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                                  </svg>
                                                ) : (
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                                  </svg>
                                                )}
                                                {commentLikes[reply.id]?.count > 0 && (
                                                  <span className="text-[10px]">{commentLikes[reply.id].count}</span>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Reply Input */}
                                    {replyingTo[comment.id] && (
                                      <div className="ml-12 flex gap-2">
                                        <input
                                          type="text"
                                          value={newCommentText[`${getActivityKey(activity)}-${comment.id}`] || ''}
                                          onChange={(e) => setNewCommentText(prev => ({ ...prev, [`${getActivityKey(activity)}-${comment.id}`]: e.target.value }))}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSubmitComment(activity, comment.id);
                                            }
                                          }}
                                          placeholder={language === 'ko' ? '답글을 입력하세요...' : 'Write a reply...'}
                                          className="flex-1 px-2 py-1 text-[10px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => handleSubmitComment(activity, comment.id)}
                                          className="px-2 py-1 text-[10px] text-white rounded-lg transition-colors"
                                          style={{ backgroundColor: '#3797F0', color: 'white', fontWeight: '600' }}
                                          onMouseEnter={(e) => e.target.style.backgroundColor = '#1877F2'}
                                          onMouseLeave={(e) => e.target.style.backgroundColor = '#3797F0'}
                                        >
                                          {language === 'ko' ? '작성' : 'Submit'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Comment Input */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newCommentText[getActivityKey(activity)] || ''}
                                onChange={(e) => setNewCommentText(prev => ({ ...prev, [getActivityKey(activity)]: e.target.value }))}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSubmitComment(activity);
                                  }
                                }}
                                placeholder={language === 'ko' ? '댓글을 입력하세요...' : 'Write a comment...'}
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => handleSubmitComment(activity)}
                                className="px-3 py-1.5 text-xs text-white rounded-lg transition-colors"
                                style={{ backgroundColor: '#3797F0', color: 'white', fontWeight: '600' }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#1877F2'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = '#3797F0'}
                              >
                                {language === 'ko' ? '작성' : 'Submit'}
                              </button>
                            </div>
                          </div>
                          )}
                        </div>
                      </div>
                    );
              })}

                    {userActivities.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-gray-600">{language === 'ko' ? '아직 활동이 없습니다.' : 'No activities yet.'}</p>
                      </div>
                    )}

                    {/* Loading Indicator for Infinite Scroll */}
                    {userActivities.length > 0 && hasMoreFeed && loadingMoreFeed && (
                      <div className="text-center py-6">
                        <div className="text-gray-600">
                          {language === 'ko' ? '로딩 중...' : 'Loading...'}
                        </div>
                      </div>
                    )}

                    {userActivities.length > 0 && !hasMoreFeed && (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        {language === 'ko' ? '모든 피드를 불러왔습니다.' : 'All activities loaded.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Follow Modal */}
        {showFollowModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowFollowModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  {followModalType === 'followers' ? (language === 'ko' ? '팔로워' : 'Followers') : (language === 'ko' ? '팔로잉' : 'Following')}
                </h2>
                <button
                  onClick={() => setShowFollowModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {followList.length > 0 ? (
                <div className="space-y-3">
                  {followList.map((follower) => (
                    <Link
                      key={follower.id}
                      to={`/user/${follower.id}`}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setShowFollowModal(false)}
                    >
                      {follower.avatar_url ? (
                        <img
                          src={getAvatarUrl(follower.avatar_url)}
                          alt={follower.display_name || follower.username}
                          className="w-12 h-12 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center border border-gray-200" style={{ background: getAvatarGradient(follower.username) }}>
                          <span className="text-white text-lg font-bold">
                            {(follower.display_name || follower.username || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {follower.display_name || follower.username}
                        </div>
                        <div className="text-sm text-gray-500">@{follower.username}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600">
                  {followModalType === 'followers'
                    ? (language === 'ko' ? '팔로워가 없습니다.' : 'No followers yet.')
                    : (language === 'ko' ? '팔로잉하는 사용자가 없습니다.' : 'Not following anyone yet.')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
