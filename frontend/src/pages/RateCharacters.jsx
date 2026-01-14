import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { characterService } from '../services/characterService';
import { useLanguage } from '../context/LanguageContext';
import Navbar from '../components/common/Navbar';
import StarRating from '../components/common/StarRating';
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';

export default function RateCharacters() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState([]);
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
      setLoading(pageNum === 1);
      const pageSize = 50;
      const offset = (pageNum - 1) * pageSize;

      // Use ULTRA FAST optimized endpoint (0.1s target)
      const data = await characterService.getCharactersForRating({
        limit: pageSize,
        offset: offset
      });

      const items = data.items || [];

      if (pageNum === 1) {
        setCharacters(items);
        // Initialize character statuses
        const statuses = {};
        items.forEach(char => {
          if (char.my_status) {
            statuses[char.id] = char.my_status;
          }
        });
        setCharacterStatuses(statuses);
      } else {
        setCharacters(prev => [...prev, ...items]);
        // Add new character statuses
        const newStatuses = {};
        items.forEach(char => {
          if (char.my_status) {
            newStatuses[char.id] = char.my_status;
          }
        });
        setCharacterStatuses(prev => ({ ...prev, ...newStatuses }));
      }

      // If we got fewer items than requested, there are no more items
      const receivedItems = items.length;
      setHasMore(receivedItems === pageSize);
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      console.error('Failed to load characters:', err);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    loadCharacters(nextPage);
  }, [hasMore, loadingMore, page]);

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

    try {
      await characterService.rateCharacter(characterId, rating);

      // Update the character in the list
      setCharacters(characters.map(char =>
        char.id === characterId ? { ...char, my_rating: rating } : char
      ));

      // Reload stats
      loadStats();
    } catch (err) {
      console.error('Failed to rate character:', err);
      alert('평가를 저장하는데 실패했습니다.');
    }
  };

  const handleStatusChange = async (characterId, status) => {
    try {
      // Check if status is already set
      const currentStatus = characterStatuses[characterId];
      const newStatus = currentStatus === status ? null : status;

      await characterService.rateCharacter(characterId, null, newStatus);

      // Update the status in state
      setCharacterStatuses(prev => ({
        ...prev,
        [characterId]: newStatus
      }));

      // Reload stats
      loadStats();
    } catch (err) {
      console.error('Failed to change status:', err);
      alert(language === 'ko' ? '상태 변경에 실패했습니다.' : 'Failed to change status.');
    }
  };

  // Get card background color based on status
  const getCardBackgroundColor = (characterId) => {
    const status = characterStatuses[characterId];
    const hasRating = characters.find(c => c.id === characterId)?.my_rating;

    if (hasRating) return 'bg-[#F5F5F5]'; // RATED
    if (status === 'WANT_TO_KNOW') return 'bg-[#F5F5F5]';
    if (status === 'NOT_INTERESTED') return 'bg-gray-200';
    return 'bg-white';
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

  // Filter and sort characters with useMemo for performance
  const filteredCharacters = useMemo(() => {
    return characters.filter(character => {
      const status = characterStatuses[character.id];

      // Exclude rated characters
      if (character.my_rating && character.my_rating > 0) {
        return false;
      }

      // Always exclude NOT_INTERESTED
      if (status === 'NOT_INTERESTED') {
        return false;
      }

      // Show WANT_TO_WATCH with 10% probability (randomly)
      if (status === 'WANT_TO_WATCH') {
        // Use character ID as seed for consistent randomness
        const seed = character.id % 10;
        return seed === 0; // 10% chance
      }

      // Show all other characters
      return true;
    }).sort((a, b) => {
      // Sort by popularity (favorites) with some randomness
      const popularityA = (a.favorites || 0) * 0.7;
      const popularityB = (b.favorites || 0) * 0.7;

      // Add deterministic random factor based on character ID
      const randomA = (a.id % 1000) * 0.3;
      const randomB = (b.id % 1000) * 0.3;

      return (popularityB + randomB) - (popularityA + randomA);
    });
  }, [characters, characterStatuses]);

  return (
    <div className="min-h-screen pt-0 md:pt-16 bg-transparent">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Stats - Always show 4 boxes from first render */}
        <div className="mb-8 flex justify-center items-center">
          {/* Stats */}
          <div className="flex gap-3 items-center">
            {/* Rated Characters */}
            <div className="bg-white px-4 py-2.5 rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow min-w-[100px]">
              <div className="text-xs text-gray-600 mb-0.5 text-center">{language === 'ko' ? '평가했어요' : 'Rated'}</div>
              <div className="text-lg font-bold text-gray-800 text-center tabular-nums">{(stats.rated || 0).toLocaleString()}</div>
            </div>

            {/* Want to Know */}
            <div className="bg-white px-4 py-2.5 rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow min-w-[100px]">
              <div className="text-xs text-gray-600 mb-0.5 text-center">{language === 'ko' ? '알고싶어요' : 'Want to Know'}</div>
              <div className="text-lg font-bold text-gray-800 text-center tabular-nums">{(stats.wantToKnow || 0).toLocaleString()}</div>
            </div>

            {/* Not Interested */}
            <div className="bg-white px-4 py-2.5 rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow min-w-[100px]">
              <div className="text-xs text-gray-600 mb-0.5 text-center">{language === 'ko' ? '관심없어요' : 'Not Interested'}</div>
              <div className="text-lg font-bold text-gray-800 text-center tabular-nums">{(stats.notInterested || 0).toLocaleString()}</div>
            </div>

            {/* Average Rating - Always show */}
            <div className="bg-white px-4 py-2.5 rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow min-w-[100px]">
              <div className="text-xs text-gray-600 mb-0.5 text-center">{language === 'ko' ? '평균 평점' : 'Avg Rating'}</div>
              <div className="text-lg font-bold text-gray-800 text-center tabular-nums">
                {stats.averageRating > 0 ? `★ ${stats.averageRating.toFixed(1)}` : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Character Grid */}
        {loading && characters.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-600">{language === 'ko' ? '로딩 중...' : 'Loading...'}</div>
          </div>
        ) : filteredCharacters.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredCharacters.map((character) => (
              <div
                key={character.id}
                ref={(el) => {
                  if (el) cardRefs.current[character.id] = el;
                }}
                className={`${getCardBackgroundColor(character.id)} rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all duration-300`}
                onMouseEnter={() => setHoveredCharacter(character.id)}
                onMouseLeave={() => setHoveredCharacter(null)}
              >
                {/* Character Image */}
                <Link to={`/character/${character.id}`} className="block">
                  <div className="aspect-[3/4] bg-gray-200 relative overflow-hidden group cursor-pointer">
                    <img
                      src={getImageUrl(character.image_url)}
                      alt={character.name_full}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.target.src = '/placeholder-anime.svg';
                      }}
                    />

                  {/* Role Badge */}
                  {character.role && (
                    <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold text-white`} style={{
                      backgroundColor: character.role === 'MAIN'
                        ? '#3797F0'  // 주연: 진한 파란색 (테마색)
                        : character.role === 'SUPPORTING'
                        ? '#60A5FA'  // 조연: 연한 파란색 (테마색 계열)
                        : '#9CA3AF',  // 엑스트라: 회색
                      color: 'white'
                    }}>
                      {character.role === 'MAIN'
                        ? (language === 'ko' ? '주연' : 'Main')
                        : character.role === 'SUPPORTING'
                        ? (language === 'ko' ? '조연' : 'Supporting')
                        : (language === 'ko' ? '엑스트라' : 'Extra')}
                    </div>
                  )}

                  {/* Status Badge */}
                  {characterStatuses[character.id] && (
                    <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold text-white ${
                      characterStatuses[character.id] === 'WANT_TO_KNOW'
                        ? 'bg-blue-600'
                        : 'bg-gray-600'
                    }`}>
                      {characterStatuses[character.id] === 'WANT_TO_KNOW'
                        ? (language === 'ko' ? '알고싶어요' : 'Want to Know')
                        : (language === 'ko' ? '관심없어요' : 'Not Interested')}
                    </div>
                  )}

                  {/* Rating Overlay */}
                  {hoveredCharacter === character.id && starSizes[character.id] && (
                    <div
                      className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center px-2 py-2 z-10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseLeave={() => setHoverRating(prev => ({ ...prev, [character.id]: 0 }))}
                    >
                      <div className="w-full flex flex-col items-center justify-center">
                        <div className="flex gap-1 mb-3" style={{
                          fontSize: starSizes[character.id]
                        }}>
                          {[1, 2, 3, 4, 5].map((position) => {
                            const currentRating = getCurrentRating(character);
                            const displayRating = hoverRating[character.id] || currentRating;

                            const gradientStyle = {
                              background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 40%, #F77737 70%, #FCAF45 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            };

                            let starContent;
                            if (displayRating >= position) {
                              starContent = <span style={gradientStyle}>★</span>;
                            } else if (displayRating >= position - 0.5) {
                              starContent = (
                                <span className="relative inline-block">
                                  <span className="text-gray-400">★</span>
                                  <span className="absolute top-0 left-0 overflow-hidden w-1/2" style={gradientStyle}>★</span>
                                </span>
                              );
                            } else {
                              starContent = <span className="text-gray-400">★</span>;
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
                        <div className="flex items-center justify-center gap-3 text-white text-sm mt-3">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleStatusChange(character.id, 'WANT_TO_KNOW');
                            }}
                            className={`transition-colors underline-offset-2 hover:underline ${
                              characterStatuses[character.id] === 'WANT_TO_KNOW'
                                ? 'font-semibold'
                                : 'text-gray-300 hover:text-gray-100'
                            }`}
                          >
                            {language === 'ko' ? '알고싶어요' : 'Want to Know'}
                          </button>
                          <span className="text-gray-400">|</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleStatusChange(character.id, 'NOT_INTERESTED');
                            }}
                            className={`transition-colors underline-offset-2 hover:underline ${
                              characterStatuses[character.id] === 'NOT_INTERESTED'
                                ? 'font-semibold'
                                : 'text-gray-300 hover:text-gray-100'
                            }`}
                          >
                            {language === 'ko' ? '관심없어요' : 'Not Interested'}
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
                    <h3 className="font-bold text-sm line-clamp-2 mb-1 group-hover:text-[#A8E6CF] transition-colors cursor-pointer" title={character.name_full}>
                      {character.name_full}
                    </h3>
                  </Link>
                  {character.name_native && character.name_native !== character.name_full && (
                    <p className="text-xs text-gray-500 line-clamp-1 mb-2" title={character.name_native}>
                      {character.name_native}
                    </p>
                  )}

                  {/* Anime Info */}
                  <div className="text-xs text-gray-600 flex items-center gap-1 mb-3">
                    <span>from</span>
                    <Link
                      to={`/anime/${character.anime_id}`}
                      className="font-medium line-clamp-1 hover:text-[#A8E6CF] transition-colors cursor-pointer hover:underline"
                      title={character.anime_title_korean || character.anime_title}
                    >
                      {character.anime_title_korean || character.anime_title}
                    </Link>
                  </div>

                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-xl text-gray-600 mb-4">
              평가한 애니메이션이 없습니다
            </div>
            <p className="text-gray-500">
              먼저 애니메이션을 평가하면 캐릭터를 평가할 수 있습니다.
            </p>
          </div>
        )}

        {/* Loading More Indicator */}
        {loadingMore && characters.length > 0 && (
          <div className="text-center py-8">
            <div className="text-gray-600">{t('loading')}</div>
          </div>
        )}

        {/* Intersection Observer Target */}
        {hasMore && characters.length > 0 && (
          <div ref={observerRef} className="h-10" />
        )}

        {/* All Loaded Message */}
        {!hasMore && characters.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            {t('allLoaded')}
          </div>
        )}
      </div>
    </div>
  );
}
