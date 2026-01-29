import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

/**
 * ContentMenu - 컨텐츠 카드 우상단 ... 메뉴
 *
 * @param {object} props
 * @param {string} props.type - 'anime_rating' | 'character_rating' | 'user_post'
 * @param {object} props.item - 컨텐츠 아이템 (rating, review 등)
 * @param {function} props.onEdit - 수정 콜백
 * @param {function} props.onDelete - 삭제 콜백
 * @param {function} props.onEditRating - 별점 수정 콜백 (리뷰 없을 때)
 * @param {function} props.onAddReview - 리뷰 추가 콜백 (리뷰 없을 때)
 */
export default function ContentMenu({
  type,
  item,
  onEdit,
  onDelete,
  onEditRating,
  onAddReview
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const hasReview = item.review_content && item.review_content.trim();
  const isUserPost = type === 'user_post';

  // Only show menu for own content
  const isOwnContent = user && item.user_id && user.id === item.user_id;

  if (!isOwnContent) {
    return null;
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMenuClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleAction = (action) => {
    setIsOpen(false);
    action();
  };

  const handleDelete = () => {
    // Don't show confirm here - parent handler will show it
    onDelete();
  };

  return (
    <div ref={menuRef} className="relative">
      {/* ... 버튼 */}
      <button
        onClick={handleMenuClick}
        className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
        aria-label="More options"
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {isUserPost ? (
            // 일반 포스트인 경우 - 단순히 "수정"만 표시
            <button
              onClick={() => handleAction(onEdit)}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors text-sm"
            >
              {language === 'ko' ? '수정' : language === 'ja' ? '編集' : 'Edit'}
            </button>
          ) : (
            // 애니/캐릭터 평가 - 리뷰 유무와 관계없이 동일한 메뉴
            <button
              onClick={() => handleAction(onEdit)}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors text-sm"
            >
              {language === 'ko' ? '수정' : language === 'ja' ? '編集' : 'Edit'}
            </button>
          )}

          <div className="border-t border-gray-200 my-1"></div>

          <button
            onClick={() => handleAction(handleDelete)}
            className="w-full text-left px-4 py-2 hover:bg-red-50 transition-colors text-sm text-red-600"
          >
            {language === 'ko' ? '삭제' : language === 'ja' ? '削除' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}
