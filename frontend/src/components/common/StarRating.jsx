import { useState, useRef, useEffect } from 'react';

export default function StarRating({ rating, onRatingChange, readonly = false, size = 'md', showNumber = true, align = 'left', dynamicSize = false }) {
  const [hoverRating, setHoverRating] = useState(0);
  const containerRef = useRef(null);
  const [computedSize, setComputedSize] = useState(null);

  const sizeClasses = {
    sm: 'w-4 h-4',
    feed: 'w-[18px] h-[18px]',
    md: 'w-6 h-6',
    lg: 'w-8 h-8 sm:w-10 sm:h-10',
    xl: 'w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12',
    widget: 'w-[46px] h-[46px] sm:w-[50px] sm:h-[50px]',  // 위젯용 - 15% 더 크게
  };

  useEffect(() => {
    if (dynamicSize && containerRef.current) {
      const updateSize = () => {
        // 부모 컨테이너의 너비를 직접 사용
        const parentElement = containerRef.current.parentElement;
        if (parentElement) {
          const containerWidth = parentElement.offsetWidth;
          // 별 5개 + gap을 고려한 크기 계산
          // 패딩과 여백을 고려하여 65%만 사용
          const availableWidth = containerWidth * 0.65;
          const singleStarSize = availableWidth / 6.5; // 더 보수적으로
          setComputedSize(`${singleStarSize}px`);
        }
      };

      // DOM이 완전히 렌더링된 후 실행
      setTimeout(updateSize, 150);
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, [dynamicSize]);

  const getStarType = (position) => {
    // Only show hover effect if hovering and it's different from current rating
    const currentRating = readonly ? rating : (hoverRating > 0 ? hoverRating : rating);
    if (currentRating >= position) {
      return 'full';
    } else if (currentRating >= position - 0.5) {
      return 'half';
    }
    return 'empty';
  };

  const handleClick = (e, position) => {
    if (readonly || !onRatingChange) return;

    // Detect click position (left half or right half)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;
    const clickedRating = isLeftHalf ? position - 0.5 : position;

    // If clicking the same rating, set to 0 (remove rating)
    if (rating === clickedRating) {
      onRatingChange(0);
    } else {
      onRatingChange(clickedRating);
    }
  };

  const handleMouseMove = (e, position) => {
    if (readonly || !onRatingChange) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;

    setHoverRating(isLeftHalf ? position - 0.5 : position);
  };

  const handleMouseLeave = () => {
    if (readonly || !onRatingChange) return;
    setHoverRating(0);
  };

  const starPath = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

  const StarIcon = ({ type }) => {
    if (type === 'full') {
      return (
        <svg className="w-full h-full" fill="url(#star-gradient-rating)" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="star-gradient-rating" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
              <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#FF8C00', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <path d={starPath} />
        </svg>
      );
    } else if (type === 'half') {
      return (
        <div className="relative w-full h-full">
          <svg className="w-full h-full text-gray-300" fill="currentColor" viewBox="0 0 20 20">
            <path d={starPath} />
          </svg>
          <div className="absolute top-0 left-0 overflow-hidden w-1/2 h-full">
            <svg className="w-full h-full" fill="url(#star-gradient-rating-half)" viewBox="0 0 20 20" style={{ width: '200%' }}>
              <defs>
                <linearGradient id="star-gradient-rating-half" x1="0%" y1="0%" x2="100%" y2="100%">
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
      <svg className="w-full h-full text-gray-300" fill="currentColor" viewBox="0 0 20 20">
        <path d={starPath} />
      </svg>
    );
  };

  const gapClasses = {
    sm: 'gap-0.5',
    feed: 'gap-0',
    md: 'gap-1',
    lg: 'gap-1 sm:gap-1.5',
    xl: 'gap-1 sm:gap-1.5',
    widget: 'gap-px',  // 위젯용 - 간격 좁게 (1px)
  };

  const alignClasses = {
    left: '',
    center: 'justify-center'
  };

  const finalSize = dynamicSize && computedSize ? computedSize : null;
  const sizeClass = finalSize ? '' : sizeClasses[size];

  return (
    <div
      className={`flex items-center ${alignClasses[align]} ${align === 'center' ? 'w-full' : ''}`}
      ref={containerRef}
    >
      <div
        className={`flex items-center ${gapClasses[size]}`}
        style={finalSize ? { fontSize: finalSize } : {}}
        onMouseLeave={handleMouseLeave}
      >
        {[1, 2, 3, 4, 5].map((position) => (
          <button
            key={position}
            type="button"
            onClick={(e) => handleClick(e, position)}
            onMouseMove={(e) => handleMouseMove(e, position)}
            disabled={readonly}
            className={`${sizeClasses[size]} ${
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
            } transition-transform flex-shrink-0`}
            style={finalSize ? { width: finalSize, height: finalSize } : {}}
          >
            <StarIcon type={getStarType(position)} />
          </button>
        ))}
      </div>
      {showNumber && rating > 0 && (
        <span className={`ml-2 sm:ml-3 text-gray-700 font-semibold ${
          size === 'xl' ? 'text-xl sm:text-2xl md:text-3xl' :
          size === 'lg' ? 'text-lg sm:text-xl' :
          size === 'md' ? 'text-base' : 'text-sm'
        }`}>{rating.toFixed(1)}</span>
      )}
    </div>
  );
}
