import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { animeService } from '../services/animeService';
import { ratingService } from '../services/ratingService';
import { seriesService } from '../services/seriesService';
import { useLanguage } from '../context/LanguageContext';
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';

function RatingCard({ anime, onRate }) {
  const { getAnimeTitle, t, language } = useLanguage();
  const [hoverRating, setHoverRating] = useState(0);
  const [currentRating, setCurrentRating] = useState(0);
  const [status, setStatus] = useState(anime.user_rating_status || null); // null, 'RATED', 'WANT_TO_WATCH', 'PASS'
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [animating, setAnimating] = useState(false);
  const cardRef = useRef(null);
  const [starSize, setStarSize] = useState('3rem');

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '/placeholder-anime.svg';
    if (imageUrl.startsWith('http')) return imageUrl;
    // Use covers_large for better quality
    const processedUrl = imageUrl.includes('/covers/')
      ? imageUrl.replace('/covers/', '/covers_large/')
      : imageUrl;
    return `${IMAGE_BASE_URL}${processedUrl}`;
  };

  // Update status and rating when anime props change
  useEffect(() => {
    setStatus(anime.user_rating_status || null);
    setCurrentRating(anime.user_rating || 0);
  }, [anime.user_rating_status, anime.user_rating]);

  useEffect(() => {
    const updateStarSize = () => {
      if (cardRef.current) {
        const cardWidth = cardRef.current.offsetWidth;
        // 카드 너비의 85%를 별 5개로 나눔 (더 크게)
        const availableWidth = cardWidth * 0.85;
        const singleStarSize = availableWidth / 5.0; // 더 크게 (6% increase): 5.3 → 5.0
        setStarSize(`${singleStarSize}px`);
      }
    };

    updateStarSize();
    window.addEventListener('resize', updateStarSize);
    return () => window.removeEventListener('resize', updateStarSize);
  }, []);

  const handleStarClick = async (rating) => {
    setCurrentRating(rating);
    setStatus('RATED');
    setAnimating(true);
    setTimeout(() => setAnimating(false), 600);

    try {
      await onRate(anime.id, rating, 'RATED');
    } catch (err) {
      console.error('Failed to rate:', err);
      setStatus(null);
      setCurrentRating(0);
    }
  };

  const handleStatusClick = async (statusType) => {
    // 시리즈 확인
    try {
      const series = await seriesService.getAnimeSequels(anime.id);
      if (series && series.sequels && series.sequels.length > 0) {
        // 시리즈가 있으면 모달 표시
        setSeriesInfo(series);
        setPendingStatus(statusType);
        setShowSeriesModal(true);
        return;
      }
    } catch (err) {
      console.error('Failed to check series:', err);
    }

    // 시리즈가 없으면 바로 처리
    setStatus(statusType);
    setCurrentRating(0); // Clear rating when changing status
    setAnimating(true);
    setTimeout(() => setAnimating(false), 600);
    try {
      await onRate(anime.id, null, statusType);
    } catch (err) {
      console.error('Failed to save status:', err);
      setStatus(null);
    }
  };

  const handleSeriesConfirm = async (applyToAll) => {
    setShowSeriesModal(false);

    if (applyToAll && seriesInfo) {
      // 일괄 처리
      const animeIds = [anime.id, ...seriesInfo.sequels.map(s => s.id)];
      try {
        await seriesService.bulkRateSeries(animeIds, pendingStatus);
        setStatus(pendingStatus);
      } catch (err) {
        console.error('Failed to bulk rate:', err);
      }
    } else {
      // 현재만 처리
      setStatus(pendingStatus);
      try {
        await onRate(anime.id, null, pendingStatus);
      } catch (err) {
        console.error('Failed to save status:', err);
        setStatus(null);
      }
    }

    setSeriesInfo(null);
    setPendingStatus(null);
  };

  const handleSeriesCancel = () => {
    setShowSeriesModal(false);
    setSeriesInfo(null);
    setPendingStatus(null);
  };

  const handleStarHover = (star, isLeftHalf) => {
    const rating = isLeftHalf ? star - 0.5 : star;
    setHoverRating(rating);
  };

  const handleMouseMove = (e, star) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;
    handleStarHover(star, isLeftHalf);
  };

  const starPath = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

  const renderStar = (position) => {
    const displayRating = hoverRating || currentRating;

    if (displayRating >= position) {
      return (
        <svg className="w-full h-full" fill="url(#star-gradient-rate)" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="star-gradient-rate" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
              <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <path d={starPath} />
        </svg>
      );
    } else if (displayRating >= position - 0.5) {
      return (
        <div className="relative w-full h-full">
          <svg className="w-full h-full text-white/40" fill="currentColor" viewBox="0 0 20 20">
            <path d={starPath} />
          </svg>
          <div className="absolute top-0 left-0 overflow-hidden w-1/2 h-full">
            <svg className="w-full h-full" fill="url(#star-gradient-rate-half)" viewBox="0 0 20 20" style={{ width: '200%' }}>
              <defs>
                <linearGradient id="star-gradient-rate-half" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
                  <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              <path d={starPath} />
            </svg>
          </div>
        </div>
      );
    }
    return (
      <svg className="w-full h-full text-white/40" fill="currentColor" viewBox="0 0 20 20">
        <path d={starPath} />
      </svg>
    );
  };

  const getCardBackgroundColor = () => {
    if (status === 'RATED') return 'bg-surface-elevated';
    if (status === 'WANT_TO_WATCH') return 'bg-surface';
    if (status === 'PASS') return 'bg-surface-hover';
    return 'bg-surface';
  };

  return (
    <div
      ref={cardRef}
      className={`rounded-lg overflow-hidden transition-all duration-500 ease-out ${animating ? 'scale-110' : 'scale-100'
        }`}
      style={{
        background: status === 'RATED'
          ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)'
          : 'transparent',
        padding: status === 'RATED' ? '2px' : '0',
        boxShadow: status === 'RATED'
          ? '0 4px 20px rgba(225, 48, 108, 0.3)'
          : undefined
      }}
    >
      <div className={`${getCardBackgroundColor()} rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all duration-500 ease-out group ${status === 'PASS' ? 'opacity-50' : 'opacity-100'
        } ${status !== 'RATED' ? 'border border-border' : ''}`}>
        {/* Cover Image */}
        <Link to={`/anime/${anime.id}`} className="block">
          <div className="aspect-[3/4] w-full relative bg-surface-elevated overflow-hidden">
            <img
              src={getImageUrl(anime.cover_image_url)}
              alt={getAnimeTitle(anime)}
              className="w-full h-full object-cover block group-hover:scale-110 transition-transform duration-[1500ms]"
              onError={(e) => {
                e.target.src = '/placeholder-anime.svg';
              }}
            />

            {/* Show clear rating on already rated anime - hide on hover */}
            {status === 'RATED' && currentRating > 0 && (
              <div className="absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none z-10 group-hover:opacity-0">
                <div className="flex justify-center gap-1 drop-shadow-lg" style={{ fontSize: starSize }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star}>
                      {renderStar(star)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dark overlay on hover - consistent with character cards */}
            <div
              className="absolute inset-0 transition-all duration-500 flex flex-col items-center justify-center p-2 z-10 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-full flex flex-col items-center justify-center">
                {/* Star Rating */}
                <div
                  className="flex justify-center gap-1"
                  style={{ fontSize: starSize }}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
                      onMouseMove={(e) => handleMouseMove(e, star)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const isLeftHalf = x < rect.width / 2;
                        handleStarClick(isLeftHalf ? star - 0.5 : star);
                      }}
                    >
                      {renderStar(star)}
                    </button>
                  ))}
                </div>

                {currentRating > 0 && (
                  <div className="text-white text-lg font-bold mt-1 drop-shadow-lg">
                    {currentRating.toFixed(1)}
                  </div>
                )}

                {/* Actions - Watch Later & Pass */}
                <div className="flex items-center justify-center gap-3 text-sm mt-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStatusClick('WANT_TO_WATCH');
                    }}
                    className={`transition-colors underline-offset-2 hover:underline ${
                      status === 'WANT_TO_WATCH'
                        ? 'text-white font-semibold'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {t('watchLater')}
                  </button>
                  <span className="text-white/40">|</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStatusClick('PASS');
                    }}
                    className={`transition-colors underline-offset-2 hover:underline ${
                      status === 'PASS'
                        ? 'text-white font-semibold'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {t('notInterested')}
                  </button>
                </div>
              </div>
            </div>

            {/* Status Badge */}
            {status && (
              <div className="absolute top-2 right-2 z-10">
                {status === 'RATED' && (
                  <span className="px-3 py-1 text-white text-xs font-bold rounded-full shadow-lg" style={{
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)'
                  }}>
                    {language === 'ko' ? '평가완료' : language === 'ja' ? '評価済み' : 'Rated'}
                  </span>
                )}
                {status === 'WANT_TO_WATCH' && (
                  <span className="px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full shadow-lg">
                    {language === 'ko' ? '보고싶어요' : language === 'ja' ? '見たい' : 'Watch Later'}
                  </span>
                )}
                {status === 'PASS' && (
                  <span className="px-3 py-1 bg-gray-500 text-white text-xs font-bold rounded-full shadow-lg">
                    {language === 'ko' ? '패스' : language === 'ja' ? 'パス' : 'Pass'}
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>

        {/* Title */}
        <div className="p-4">
          <Link to={`/anime/${anime.id}`} className="block group/title">
            {(() => {
              const titles = getAnimeTitle(anime, true);
              return (
                <>
                  <h3 className="font-semibold text-lg line-clamp-2 text-text-primary leading-snug mb-1 group-hover/title:text-primary transition-colors cursor-pointer">
                    {titles.primary}
                  </h3>
                  {titles.secondary && (
                    <p className="text-xs text-text-tertiary line-clamp-1 mb-1">
                      {titles.secondary}
                    </p>
                  )}
                </>
              );
            })()}
          </Link>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            {anime.season_year && <span>{anime.season_year}</span>}
            {anime.episodes && <span>·</span>}
            {anime.episodes && <span>{anime.episodes}{t('episodes')}</span>}
          </div>
        </div>
      </div>

      {/* 시리즈 일괄 처리 모달 */}
      {showSeriesModal && seriesInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]" onClick={handleSeriesCancel}>
          <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4 border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-text-primary">{language === 'ko' ? '시리즈 일괄 처리' : language === 'ja' ? 'シリーズ一括処理' : 'Series Bulk Action'}</h3>

            <div className="mb-4">
              <p className="text-text-secondary mb-3">
                {language === 'ko' ? `이 작품은 ${seriesInfo.sequels.length}개의 후속작이 있습니다.` : language === 'ja' ? `この作品は${seriesInfo.sequels.length}個の続編があります。` : `This work has ${seriesInfo.sequels.length} sequels.`}
              </p>

              <div className="bg-surface-elevated border border-tertiary rounded-lg p-4 mb-3">
                <p className="text-sm font-medium text-text-primary mb-2">
                  {language === 'ko' ? '후속작 목록:' : language === 'ja' ? '続編リスト:' : 'Sequels:'}
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {seriesInfo.sequels.map((sequel, index) => (
                    <p key={sequel.id} className="text-sm text-text-secondary">
                      {index + 1}. {sequel.title_korean || sequel.title_romaji}
                    </p>
                  ))}
                </div>
              </div>

              <p className="text-text-secondary mb-2">
                {language === 'ko' ? (
                  <>이 작품과 모든 후속작에 <strong className="text-primary">
                    {pendingStatus === 'WANT_TO_WATCH' ? t('watchLater') : t('notInterested')}
                  </strong>를 적용하시겠습니까?</>
                ) : language === 'ja' ? (
                  <>この作品とすべての続編に<strong className="text-primary">
                    {pendingStatus === 'WANT_TO_WATCH' ? t('watchLater') : t('notInterested')}
                  </strong>を適用しますか？</>
                ) : (
                  <>Apply <strong className="text-primary">
                    {pendingStatus === 'WANT_TO_WATCH' ? t('watchLater') : t('notInterested')}
                  </strong> to this work and all sequels?</>
                )}
              </p>

              <p className="text-sm text-text-secondary bg-surface-hover p-3 rounded">
                {language === 'ko' ? '💡 이전 시즌은 영향받지 않습니다. (이미 보셨거나 다른 평가를 했을 수 있으므로)' : language === 'ja' ? '💡 前のシーズンは影響を受けません。（既に視聴済みまたは他の評価をしている可能性があるため）' : '💡 Previous seasons are not affected. (You may have already watched or rated them differently)'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleSeriesConfirm(true)}
                className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 px-4 rounded font-medium transition-colors"
              >
                {language === 'ko' ? `모두 적용 (${seriesInfo.sequels.length + 1}개)` : language === 'ja' ? `全て適用 (${seriesInfo.sequels.length + 1}個)` : `Apply All (${seriesInfo.sequels.length + 1})`}
              </button>
              <button
                onClick={() => handleSeriesConfirm(false)}
                className="flex-1 bg-surface-elevated hover:bg-surface-hover text-text-secondary py-2 px-4 rounded font-medium transition-colors"
              >
                {language === 'ko' ? '현재만' : language === 'ja' ? '現在のみ' : 'Current Only'}
              </button>
              <button
                onClick={handleSeriesCancel}
                className="bg-surface-hover hover:bg-border text-text-tertiary py-2 px-4 rounded font-medium transition-colors"
              >
                {language === 'ko' ? '취소' : language === 'ja' ? 'キャンセル' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Rate() {
  const { t, language } = useLanguage();
  const [animeList, setAnimeList] = useState([]);
  const [allAnimeItems, setAllAnimeItems] = useState([]); // All loaded items
  const [displayedCount, setDisplayedCount] = useState(0); // How many are displayed
  const [loading, setLoading] = useState(true); // Fix: Start with loading true
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    rated: 0,
    watchLater: 0,
    pass: 0,
    remaining: 0,
    averageRating: 0
  });
  const observerRef = useRef(null);

  useEffect(() => {
    loadAnime();
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Use ULTRA FAST optimized stats endpoint (0.1s target)
      const data = await animeService.getAnimeRatingStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      // Fallback to defaults
      setStats({
        total: 3000,
        rated: 0,
        watchLater: 0,
        pass: 0,
        remaining: 3000,
        averageRating: 0
      });
    }
  };

  const loadStatsOld = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || API_BASE_URL}/api/users/me/stats`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats({
          total: data.total_anime || 3000,
          rated: data.total_rated || 0,
          averageRating: data.average_rating || 0,
          watchLater: data.total_want_to_watch || 0,
          pass: data.total_pass || 0,
          remaining: (data.total_anime || 3000) - (data.total_rated || 0) - (data.total_pass || 0)
        });
      } else {
        // Fallback to default
        setStats({
          total: 3000,
          rated: 0,
          watchLater: 0,
          pass: 0,
          remaining: 3000
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      // Fallback to default (관심목록은 다시 평가 가능하므로 남은 개수에 포함)
      setStats({
        total: 3000,
        rated: 0,
        watchLater: 0,
        pass: 0,
        remaining: 3000,
        averageRating: 0
      });
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading]);

  const loadAnime = async () => {
    try {
      setLoading(true);
      console.log('[Rate] Loading initial anime list...'); // Debug Log

      // Load 100 items at once, paginate on frontend
      const data = await animeService.getAnimeForRating({
        limit: 100
      });

      console.log('[Rate] Loaded anime:', data?.items?.length); // Debug Log

      const allItems = data.items || [];
      // Show first 20 items immediately
      setAnimeList(allItems.slice(0, 20));
      setAllAnimeItems(allItems);
      setDisplayedCount(20);
      setHasMore(allItems.length > 20);
      setPage(1);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load anime:', err);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loading || !hasMore) {
      return;
    }

    try {
      setLoading(true);

      // If we have more frontend-cached items, show them first
      if (displayedCount < allAnimeItems.length) {
        const newDisplayedCount = Math.min(displayedCount + 20, allAnimeItems.length);
        setAnimeList(allAnimeItems.slice(0, newDisplayedCount));
        setDisplayedCount(newDisplayedCount);
        setHasMore(true); // Always true for infinite scroll
        setPage(page + 1);
        setLoading(false);
      } else {
        // All frontend items shown, load more from backend
        const data = await animeService.getAnimeForRating({
          limit: 50,
          offset: allAnimeItems.length
        });

        if (data.items && data.items.length > 0) {
          const newAllItems = [...allAnimeItems, ...data.items];
          setAllAnimeItems(newAllItems);
          setAnimeList(newAllItems.slice(0, displayedCount + 20));
          setDisplayedCount(displayedCount + 20);
          setHasMore(true); // Keep loading
        } else {
          setHasMore(false); // No more items
        }
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load more:', err);
      setLoading(false);
    }
  };

  const handleRate = async (animeId, rating, status = 'RATED') => {
    // Save previous state for rollback
    const prevAnime = animeList.find(a => a.id === animeId);
    const prevRating = prevAnime?.user_rating;
    const prevStatus = prevAnime?.user_rating_status;

    // Optimistic UI update - show success immediately
    const newRating = status === 'RATED' ? rating : 0;
    setAnimeList(prev => prev.map(anime =>
      anime.id === animeId
        ? { ...anime, user_rating_status: status, user_rating: newRating }
        : anime
    ));
    setAllAnimeItems(prev => prev.map(anime =>
      anime.id === animeId
        ? { ...anime, user_rating_status: status, user_rating: newRating }
        : anime
    ));

    try {
      const payload = status === 'RATED'
        ? { rating, status: 'RATED' }
        : { status };

      const response = await ratingService.rateAnime(animeId, payload);

      // Update cached otaku_score if provided
      if (response && response.otaku_score !== undefined) {
        localStorage.setItem('cached_otaku_score', response.otaku_score.toString());
        window.dispatchEvent(new Event('storage'));
      }

      // Reload stats after rating
      await loadStats();
    } catch (err) {
      console.error('Failed to rate:', err);

      // Rollback on failure
      setAnimeList(prev => prev.map(anime =>
        anime.id === animeId
          ? { ...anime, user_rating_status: prevStatus, user_rating: prevRating }
          : anime
      ));
      setAllAnimeItems(prev => prev.map(anime =>
        anime.id === animeId
          ? { ...anime, user_rating_status: prevStatus, user_rating: prevRating }
          : anime
      ));

      alert(language === 'ko' ? '평가 저장에 실패했습니다. 다시 시도해주세요.' : language === 'ja' ? '評価の保存に失敗しました。もう一度お試しください。' : 'Failed to save rating. Please try again.');
      throw err;
    }
  };

  // Don't filter - keep all anime including rated ones (they'll show with visual feedback)
  const filteredAnimeList = useMemo(() => {
    return animeList;
  }, [animeList]);


  return (
    <div className="min-h-screen pt-10 md:pt-12 bg-transparent">

      <div className="max-w-[1180px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Header with Stats */}
        <div className="flex justify-center items-center mb-4">
          {/* Stats */}
          <div className="flex gap-2 items-center flex-wrap justify-center">
            {/* Rated */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '평가했어요' : language === 'ja' ? '評価済み' : 'Rated'}</div>
              <div className="text-base font-bold text-primary text-center tabular-nums">{stats.rated.toLocaleString()}</div>
            </div>

            {/* Watch Later */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '보고싶어요' : language === 'ja' ? '見たい' : 'Later'}</div>
              <div className="text-base font-bold text-secondary text-center tabular-nums">{stats.watchLater.toLocaleString()}</div>
            </div>

            {/* Pass */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '관심없어요' : language === 'ja' ? '興味なし' : 'Pass'}</div>
              <div className="text-base font-bold text-text-tertiary text-center tabular-nums">{stats.pass.toLocaleString()}</div>
            </div>

            {/* Average Rating - Always show */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '평균 평점' : language === 'ja' ? '平均評価' : 'Avg Rating'}</div>
              <div className="text-base font-bold text-accent text-center tabular-nums">
                {stats.averageRating > 0 ? `★ ${stats.averageRating.toFixed(1)}` : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Anime Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {loading && animeList.length === 0 ? (
            // Skeleton cards during initial load (Show 8 skeletons)
            Array.from({ length: 8 }).map((_, index) => (
              <div key={`skeleton-${index}`} className="bg-surface rounded-lg shadow-md overflow-hidden animate-pulse border border-border">
                {/* Skeleton Image */}
                <div className="aspect-[3/4] bg-surface-elevated" />
                {/* Skeleton Title */}
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-surface-elevated rounded w-3/4" />
                  <div className="h-3 bg-surface-elevated rounded w-1/2" />
                </div>
              </div>
            ))
          ) : filteredAnimeList.length > 0 ? (
            filteredAnimeList.map((anime) => (
              <RatingCard key={anime.id} anime={anime} onRate={handleRate} />
            ))
          ) : (
            // Fix: Empty state when not loading and no items
            <div className="col-span-full text-center py-12">
              <div className="text-xl text-text-secondary mb-4">
                {language === 'ko' ? '평가할 애니메이션이 없습니다' : language === 'ja' ? '評価するアニメがありません' : 'No anime to rate'}
              </div>
              <p className="text-text-tertiary">
                {language === 'ko' ? '모든 애니메이션을 평가하셨거나 데이터를 불러올 수 없습니다.' : language === 'ja' ? 'すべてのアニメを評価したか、データを読み込めませんでした。' : 'You have rated all anime or data could not be loaded.'}
              </p>
            </div>
          )}
        </div>

        {/* Loading more indicator */}
        {loading && animeList.length > 0 && (
          <div className="text-center py-8">
            <div className="text-text-secondary">{t('loading')}</div>
          </div>
        )}

        {/* Intersection observer target */}
        <div ref={observerRef} className="h-10" />

        {!hasMore && animeList.length > 0 && (
          <div className="text-center py-8 text-text-tertiary">
            {t('allLoaded')}
          </div>
        )}
      </div>
    </div>
  );
}
