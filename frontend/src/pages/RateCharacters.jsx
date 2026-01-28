import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { characterService } from '../services/characterService';
import { useLanguage } from '../context/LanguageContext';
import StarRating from '../components/common/StarRating';
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';

export default function RateCharacters() {
  const { t, language, getAnimeTitle } = useLanguage();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState([]);
  const [allCharacters, setAllCharacters] = useState([]); // All loaded items
  const [displayedCount, setDisplayedCount] = useState(0); // How many are displayed
  const [stats, setStats] = useState({
    total: 0,
    rated: 0,
    wantToKnow: 0,
    notInterested: 0,
    remaining: 0,
    averageRating: 0
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hoveredCharacter, setHoveredCharacter] = useState(null);
  const [hoverRating, setHoverRating] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef(null);
  const cardRefs = useRef({});
  const [starSizes, setStarSizes] = useState({});
  const [characterStatuses, setCharacterStatuses] = useState({});

  useEffect(() => {
    loadCharacters(1);
    loadStats();
  }, []);

  // Calculate star sizes when characters change or window resizes
  useEffect(() => {
    const calculateStarSizes = () => {
      const newSizes = {};
      Object.keys(cardRefs.current).forEach(charId => {
        const cardElement = cardRefs.current[charId];
        if (cardElement) {
          const cardWidth = cardElement.offsetWidth;
          // 별 5개가 카드에 꽉 차도록 계산 (패딩 고려)
          const availableWidth = cardWidth - 12; // 좌우 패딩 px-2 (8px * 2) 줄임
          const starSize = Math.floor(availableWidth / 5.29); // 더 크게 (4% increase): 5.5 → 5.29
          newSizes[charId] = `${starSize}px`;
        }
      });
      setStarSizes(newSizes);
    };

    if (characters.length > 0) {
      setTimeout(calculateStarSizes, 100);
    }

    window.addEventListener('resize', calculateStarSizes);
    return () => window.removeEventListener('resize', calculateStarSizes);
  }, [characters]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page]);

  const loadCharacters = async (pageNum) => {
    try {
      setLoading(true);
      // Load 100 items at once, paginate on frontend
      const data = await characterService.getCharactersForRating({
        limit: 100
      });

      const items = data.items || [];
      // Show first 20 items immediately
      setCharacters(items.slice(0, 20));
      setAllCharacters(items);
      setDisplayedCount(20);
      setHasMore(items.length > 20);
      setPage(1);

      // Initialize character statuses
      const statuses = {};
      items.forEach(char => {
        if (char.my_status) {
          statuses[char.id] = char.my_status;
        }
      });
      setCharacterStatuses(statuses);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load characters:', err);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);

    try {
      // If we have more frontend-cached items, show them first
      if (displayedCount < allCharacters.length) {
        const newDisplayedCount = Math.min(displayedCount + 20, allCharacters.length);
        setCharacters(allCharacters.slice(0, newDisplayedCount));
        setDisplayedCount(newDisplayedCount);
        setHasMore(true); // Always true for infinite scroll
        setPage(page + 1);
      } else {
        // All frontend items shown, load more from backend
        const data = await characterService.getCharactersForRating({
          limit: 50,
          offset: allCharacters.length
        });

        if (data.items && data.items.length > 0) {
          const newAllCharacters = [...allCharacters, ...data.items];
          setAllCharacters(newAllCharacters);
          setCharacters(newAllCharacters.slice(0, displayedCount + 20));
          setDisplayedCount(displayedCount + 20);
          setHasMore(true); // Keep loading
        } else {
          setHasMore(false); // No more items
        }
      }
    } catch (err) {
      console.error('Failed to load more characters:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, displayedCount, allCharacters]);

  const loadStats = async () => {
    try {
      // Use ULTRA FAST optimized stats endpoint (0.1s target)
      const data = await characterService.getCharacterRatingStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleRatingChange = async (characterId, rating) => {
    if (!rating || rating === 0) return;

    // Save previous state for rollback
    const prevCharacter = characters.find(c => c.id === characterId);
    const prevRating = prevCharacter?.my_rating;
    const prevStatus = prevCharacter?.my_status;

    // Optimistic UI update - show success immediately
    setCharacters(prev => prev.map(char =>
      char.id === characterId ? { ...char, my_rating: rating, my_status: 'RATED', _animating: true } : char
    ));
    setAllCharacters(prev => prev.map(char =>
      char.id === characterId ? { ...char, my_rating: rating, my_status: 'RATED' } : char
    ));
    setCharacterStatuses(prev => ({
      ...prev,
      [characterId]: 'RATED'
    }));

    // Clear animation after delay
    setTimeout(() => {
      setCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, _animating: false } : char
      ));
    }, 600);

    try {
      const response = await characterService.rateCharacter(characterId, { rating, status: 'RATED' });

      // Update cached otaku_score if provided
      if (response && response.otaku_score !== undefined) {
        localStorage.setItem('cached_otaku_score', response.otaku_score.toString());
        window.dispatchEvent(new Event('storage'));
      }

      // Reload stats
      loadStats();
    } catch (err) {
      console.error('Failed to rate character:', err);

      // Rollback on failure
      setCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, my_rating: prevRating, my_status: prevStatus } : char
      ));
      setAllCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, my_rating: prevRating, my_status: prevStatus } : char
      ));
      setCharacterStatuses(prev => ({
        ...prev,
        [characterId]: prevStatus
      }));

      // Show error only after all retries failed
      const errorDetail = err.response?.data?.detail || err.message || 'Unknown error';
      const errorStatus = err.response?.status ? ` (${err.response.status})` : '';

      alert(
        language === 'ko'
          ? `평가를 저장하는데 실패했습니다${errorStatus}\n${errorDetail}`
          : language === 'ja'
            ? `評価の保存に失敗しました${errorStatus}\n${errorDetail}`
            : `Failed to save rating${errorStatus}\n${errorDetail}`
      );
    }
  };

  const handleStatusChange = async (characterId, status) => {
    // Save previous state for rollback
    const prevCharacter = characters.find(c => c.id === characterId);
    const prevRating = prevCharacter?.my_rating;
    const prevStatusValue = prevCharacter?.my_status;
    const prevStatusState = characterStatuses[characterId];

    // Check if status is already set (toggle off)
    const currentStatus = characterStatuses[characterId];
    const newStatus = currentStatus === status ? null : status;

    // Optimistic UI update
    setCharacters(prev => prev.map(char =>
      char.id === characterId ? { ...char, my_status: newStatus, my_rating: 0, _animating: true } : char
    ));
    setAllCharacters(prev => prev.map(char =>
      char.id === characterId ? { ...char, my_status: newStatus, my_rating: 0 } : char
    ));
    setCharacterStatuses(prev => ({
      ...prev,
      [characterId]: newStatus
    }));

    // Clear animation after delay
    setTimeout(() => {
      setCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, _animating: false } : char
      ));
    }, 600);

    try {
      const response = await characterService.rateCharacter(characterId, { status: newStatus });

      // Update cached otaku_score if provided
      if (response && response.otaku_score !== undefined) {
        localStorage.setItem('cached_otaku_score', response.otaku_score.toString());
        window.dispatchEvent(new Event('storage'));
      }

      // Reload stats
      loadStats();
    } catch (err) {
      console.error('Failed to change status:', err);

      // Rollback on failure
      setCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, my_status: prevStatusValue, my_rating: prevRating } : char
      ));
      setAllCharacters(prev => prev.map(char =>
        char.id === characterId ? { ...char, my_status: prevStatusValue, my_rating: prevRating } : char
      ));
      setCharacterStatuses(prev => ({
        ...prev,
        [characterId]: prevStatusState
      }));

      alert(language === 'ko' ? '상태 변경에 실패했습니다.' : language === 'ja' ? 'ステータス変更に失敗しました。' : 'Failed to change status.');
    }
  };

  // Get card background color based on status
  const getCardBackgroundColor = (characterId) => {
    const status = characterStatuses[characterId];
    const hasRating = characters.find(c => c.id === characterId)?.my_rating;

    if (hasRating) return 'bg-surface-elevated'; // RATED
    if (status === 'WANT_TO_KNOW') return 'bg-surface-elevated';
    if (status === 'NOT_INTERESTED') return 'bg-surface-hover';
    return 'bg-surface';
  };

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '/placeholder-anime.svg';
    if (imageUrl.startsWith('http')) return imageUrl;
    // Use covers_large for better quality
    const processedUrl = imageUrl.includes('/covers/')
      ? imageUrl.replace('/covers/', '/covers_large/')
      : imageUrl;
    return `${IMAGE_BASE_URL}${processedUrl}`;
  };

  const getCurrentRating = (character) => {
    return character.my_rating || 0;
  };

  // Don't filter - keep all characters including rated ones (they'll show with visual feedback)
  const filteredCharacters = useMemo(() => {
    return characters;
  }, [characters]);

  return (
    <div className="min-h-screen pt-10 md:pt-12 bg-transparent">

      <div className="max-w-[1180px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Header with Stats - Always show 4 boxes from first render */}
        <div className="mb-4 flex justify-center items-center">
          {/* Stats */}
          <div className="flex gap-2 items-center flex-wrap justify-center">
            {/* Rated Characters */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '평가했어요' : language === 'ja' ? '評価済み' : 'Rated'}</div>
              <div className="text-base font-bold text-primary text-center tabular-nums">{(stats.rated || 0).toLocaleString()}</div>
            </div>

            {/* Want to Know */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '알고싶어요' : language === 'ja' ? '知りたい' : 'Want to Know'}</div>
              <div className="text-base font-bold text-secondary text-center tabular-nums">{(stats.wantToKnow || 0).toLocaleString()}</div>
            </div>

            {/* Not Interested */}
            <div className="bg-surface px-3 py-1.5 rounded-md shadow-sm hover:shadow-md transition-shadow min-w-[80px] border border-border">
              <div className="text-xs text-text-secondary text-center">{language === 'ko' ? '관심없어요' : language === 'ja' ? '興味なし' : 'Not Interested'}</div>
              <div className="text-base font-bold text-text-tertiary text-center tabular-nums">{(stats.notInterested || 0).toLocaleString()}</div>
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

        {/* Character Grid */}
        {loading && characters.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
            {/* Skeleton cards during initial load */}
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="bg-surface rounded-lg overflow-hidden border border-border"
                style={{
                  boxShadow: 'var(--shadow-md)',
                  animation: `slideUp var(--transition-slow) ease-out ${index * 50}ms`
                }}
              >
                {/* Skeleton Image */}
                <div className="aspect-[3/4] skeleton" />
                {/* Skeleton Info */}
                <div className="p-3 space-y-2">
                  <div className="h-4 skeleton rounded w-4/5" />
                  <div className="h-3 skeleton rounded w-3/5" />
                  <div className="h-3 skeleton rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCharacters.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
            {filteredCharacters.map((character) => {
              const status = characterStatuses[character.id] || character.my_status;
              const hasRated = (character.my_rating && character.my_rating > 0) || status === 'RATED';
              const isCompleted = hasRated || status === 'WANT_TO_KNOW' || status === 'NOT_INTERESTED';

              return (
                <div
                  key={character.id}
                  ref={(el) => {
                    if (el) cardRefs.current[character.id] = el;
                  }}
                  className={`rounded-lg overflow-hidden transition-all duration-500 ease-out ${character._animating ? 'scale-110' : 'scale-100'
                    }`}
                  style={{
                    background: hasRated
                      ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)'
                      : 'transparent',
                    padding: hasRated ? '2px' : '0',
                    boxShadow: hasRated
                      ? '0 4px 20px rgba(225, 48, 108, 0.3)'
                      : undefined
                  }}
                  onMouseEnter={() => setHoveredCharacter(character.id)}
                  onMouseLeave={() => setHoveredCharacter(null)}
                >
                  <div className={`${getCardBackgroundColor(character.id)} rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all duration-500 ease-out group ${status === 'NOT_INTERESTED' ? 'opacity-50' : 'opacity-100'
                    } ${!hasRated ? 'border border-border' : ''}`}>
                    {/* Character Image */}
                    <Link to={`/character/${character.id}`} className="block">
                      <div className="aspect-[3/4] bg-surface-elevated relative overflow-hidden cursor-pointer">
                        <img
                          src={getImageUrl(character.image_url)}
                          alt={character.name_full}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[1500ms]"
                          onError={(e) => {
                            e.target.src = '/placeholder-anime.svg';
                          }}
                        />

                        {/* Role Badge */}
                        {character.role && (
                          <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold text-white`} style={{
                            backgroundColor: character.role === 'MAIN'
                              ? '#3797F0'  // 주연: 파란색 (테마색)
                              : character.role === 'SUPPORTING'
                                ? '#F59E0B'  // 조연: 주황색 (파란색과 대비)
                                : '#9CA3AF',  // 엑스트라: 회색
                            color: 'white'
                          }}>
                            {character.role === 'MAIN'
                              ? (language === 'ko' ? '주연' : language === 'ja' ? '主役' : 'Main')
                              : character.role === 'SUPPORTING'
                                ? (language === 'ko' ? '조연' : language === 'ja' ? '助演' : 'Supporting')
                                : (language === 'ko' ? '엑스트라' : language === 'ja' ? 'エキストラ' : 'Extra')}
                          </div>
                        )}

                        {/* Status Badge */}
                        {(hasRated || characterStatuses[character.id]) && (
                          <div className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold text-white shadow-lg" style={{
                            background: (hasRated || characterStatuses[character.id] === 'RATED')
                              ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)'
                              : characterStatuses[character.id] === 'WANT_TO_KNOW'
                                ? '#3B82F6'
                                : '#6B7280'
                          }}>
                            {(hasRated || characterStatuses[character.id] === 'RATED')
                              ? (language === 'ko' ? '평가완료' : language === 'ja' ? '評価済み' : 'Rated')
                              : characterStatuses[character.id] === 'WANT_TO_KNOW'
                                ? (language === 'ko' ? '알고싶어요' : language === 'ja' ? '知りたい' : 'Want to Know')
                                : (language === 'ko' ? '관심없어요' : language === 'ja' ? '興味なし' : 'Not Interested')}
                          </div>
                        )}

                        {/* Dark overlay for rated cards - persists always */}
                        {hasRated && (
                          <div className="absolute inset-0 bg-black/50 pointer-events-none" />
                        )}

                        {/* Show rating stars on rated characters - hide on hover */}
                        {hasRated && starSizes[character.id] && character.my_rating && character.my_rating > 0 && (
                          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-150 ${hoveredCharacter === character.id ? 'opacity-0' : 'opacity-100'}`}>
                            <div className="flex drop-shadow-lg" style={{ gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map((position) => {
                                const rating = character.my_rating;
                                const starPath = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";
                                const size = starSizes[character.id];

                                if (rating >= position) {
                                  return (
                                    <svg key={position} style={{ width: size, height: size }} fill="url(#star-gradient-char)" viewBox="0 0 20 20">
                                      <defs>
                                        <linearGradient id="star-gradient-char" x1="0%" y1="0%" x2="100%" y2="100%">
                                          <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
                                          <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
                                          <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
                                        </linearGradient>
                                      </defs>
                                      <path d={starPath} />
                                    </svg>
                                  );
                                } else if (rating >= position - 0.5) {
                                  return (
                                    <div key={position} className="relative" style={{ width: size, height: size }}>
                                      <svg className="w-full h-full text-white/40" fill="currentColor" viewBox="0 0 20 20">
                                        <path d={starPath} />
                                      </svg>
                                      <div className="absolute top-0 left-0 overflow-hidden w-1/2 h-full">
                                        <svg className="h-full" fill="url(#star-gradient-char-half)" viewBox="0 0 20 20" style={{ width: '200%' }}>
                                          <defs>
                                            <linearGradient id="star-gradient-char-half" x1="0%" y1="0%" x2="100%" y2="100%">
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
                                  <svg key={position} style={{ width: size, height: size }} className="text-white/40" fill="currentColor" viewBox="0 0 20 20">
                                    <path d={starPath} />
                                  </svg>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Rating Overlay */}
                        {starSizes[character.id] && (
                          <div
                            className={`absolute inset-0 bg-black flex items-center justify-center px-2 py-2 z-10 transition-opacity duration-500 ${hoveredCharacter === character.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                              }`}
                            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onMouseLeave={() => setHoverRating(prev => ({ ...prev, [character.id]: 0 }))}
                          >
                            <div className="w-full flex flex-col items-center justify-center">
                              <div className="flex" style={{ gap: '2px' }}>
                                {[1, 2, 3, 4, 5].map((position) => {
                                  const currentRating = getCurrentRating(character);
                                  const displayRating = hoverRating[character.id] || currentRating;
                                  const starPath = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";
                                  const size = starSizes[character.id];

                                  let starContent;
                                  if (displayRating >= position) {
                                    starContent = (
                                      <svg style={{ width: size, height: size }} fill="url(#star-gradient-char-overlay)" viewBox="0 0 20 20">
                                        <defs>
                                          <linearGradient id="star-gradient-char-overlay" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
                                            <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
                                            <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
                                          </linearGradient>
                                        </defs>
                                        <path d={starPath} />
                                      </svg>
                                    );
                                  } else if (displayRating >= position - 0.5) {
                                    starContent = (
                                      <div className="relative" style={{ width: size, height: size }}>
                                        <svg className="w-full h-full text-white/40" fill="currentColor" viewBox="0 0 20 20">
                                          <path d={starPath} />
                                        </svg>
                                        <div className="absolute top-0 left-0 overflow-hidden w-1/2 h-full">
                                          <svg className="h-full" fill="url(#star-gradient-char-overlay-half)" viewBox="0 0 20 20" style={{ width: '200%' }}>
                                            <defs>
                                              <linearGradient id="star-gradient-char-overlay-half" x1="0%" y1="0%" x2="100%" y2="100%">
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
                                  } else {
                                    starContent = (
                                      <svg style={{ width: size, height: size }} className="text-white/40" fill="currentColor" viewBox="0 0 20 20">
                                        <path d={starPath} />
                                      </svg>
                                    );
                                  }

                                  return (
                                    <button
                                      key={position}
                                      type="button"
                                      className="cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
                                      onMouseMove={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const isLeftHalf = x < rect.width / 2;
                                        setHoverRating(prev => ({
                                          ...prev,
                                          [character.id]: isLeftHalf ? position - 0.5 : position
                                        }));
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const isLeftHalf = x < rect.width / 2;
                                        handleRatingChange(character.id, isLeftHalf ? position - 0.5 : position);
                                      }}
                                    >
                                      {starContent}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Status Buttons in Overlay */}
                              <div className="flex items-center justify-center gap-3 text-sm mt-3">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleStatusChange(character.id, 'WANT_TO_KNOW');
                                  }}
                                  className={`transition-colors underline-offset-2 hover:underline ${characterStatuses[character.id] === 'WANT_TO_KNOW'
                                    ? 'text-white font-semibold'
                                    : 'text-white/80 hover:text-white'
                                    }`}
                                >
                                  {language === 'ko' ? '알고싶어요' : language === 'ja' ? '知りたい' : 'Want to Know'}
                                </button>
                                <span className="text-white/40">|</span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleStatusChange(character.id, 'NOT_INTERESTED');
                                  }}
                                  className={`transition-colors underline-offset-2 hover:underline ${characterStatuses[character.id] === 'NOT_INTERESTED'
                                    ? 'text-white font-semibold'
                                    : 'text-white/60 hover:text-white/90'
                                    }`}
                                >
                                  {language === 'ko' ? '관심없어요' : language === 'ja' ? '興味なし' : 'Not Interested'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Character Info */}
                    <div className="p-3">
                      <Link to={`/character/${character.id}`} className="block group">
                        <h3 className="font-bold text-[15px] line-clamp-2 mb-1 text-text-primary group-hover:text-primary transition-colors cursor-pointer" title={language === 'ko' ? (character.name_korean || character.name_full) : language === 'ja' ? (character.name_native || character.name_full) : character.name_full}>
                          {language === 'ko' ? (character.name_korean || character.name_full) : language === 'ja' ? (character.name_native || character.name_full) : character.name_full}
                        </h3>
                      </Link>
                      {language === 'ko' && character.name_korean ? (
                        <p className="text-xs text-text-tertiary line-clamp-1 mb-2" title={character.name_full}>
                          {character.name_full}
                        </p>
                      ) : language === 'ja' && character.name_native ? (
                        <p className="text-xs text-text-tertiary line-clamp-1 mb-2" title={character.name_full}>
                          ({character.name_full})
                        </p>
                      ) : (
                        character.name_native && character.name_native !== character.name_full && (
                          <p className="text-xs text-text-tertiary line-clamp-1 mb-2" title={character.name_native}>
                            {character.name_native}
                          </p>
                        )
                      )}

                      {/* Anime Info */}
                      <div className="text-xs text-text-secondary flex items-center gap-1 mb-3">
                        <span>from</span>
                        <Link
                          to={`/anime/${character.anime_id}`}
                          className="font-medium line-clamp-1 hover:text-primary transition-colors cursor-pointer hover:underline"
                          title={language === 'ko' ? (character.anime_title_korean || character.anime_title) : language === 'ja' ? (character.anime_title_native || character.anime_title) : character.anime_title}
                        >
                          {language === 'ko'
                            ? (character.anime_title_korean || character.anime_title)
                            : language === 'ja'
                              ? (character.anime_title_native || character.anime_title)
                              : character.anime_title}
                        </Link>
                      </div>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-xl text-text-secondary mb-4">
              {language === 'ko' ? '평가한 애니메이션이 없습니다' : language === 'ja' ? '評価済みのアニメがありません' : 'No rated anime'}
            </div>
            <p className="text-text-tertiary">
              {language === 'ko' ? '먼저 애니메이션을 평가하면 캐릭터를 평가할 수 있습니다.' : language === 'ja' ? 'まずアニメを評価すると、キャラクターを評価できます。' : 'Rate anime first to rate characters.'}
            </p>
          </div>
        )}

        {/* Loading More Indicator */}
        {loadingMore && characters.length > 0 && (
          <div className="text-center py-8">
            <div className="text-text-secondary">{t('loading')}</div>
          </div>
        )}

        {/* Intersection Observer Target */}
        {hasMore && characters.length > 0 && (
          <div ref={observerRef} className="h-10" />
        )}

        {/* All Loaded Message */}
        {!hasMore && characters.length > 0 && (
          <div className="text-center py-8 text-text-tertiary">
            {t('allLoaded')}
          </div>
        )}
      </div>
    </div>
  );
}
