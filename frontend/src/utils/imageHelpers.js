/**
 * Image URL helper utilities
 * R2-first loading strategy with external URL fallback
 */
import { API_BASE_URL, IMAGE_BASE_URL } from '../config/api';

/**
 * Get character image URL
 * Strategy: Use character ID directly with proper extension from original URL
 * @param {number|null} characterId - AniList character ID for R2 lookup
 * @param {string|null} imageUrl - External or database image URL (for extension and fallback)
 * @returns {string} Image URL to try first
 */
export const getCharacterImageUrl = (characterId, imageUrl = null) => {
  let finalUrl;

  // Priority 1: imageUrl이 R2 URL이면 그대로 사용 (어드민에서 업로드한 이미지)
  if (imageUrl && imageUrl.includes(IMAGE_BASE_URL)) {
    finalUrl = imageUrl;
  }
  // Priority 2: character ID가 있으면 R2에서 찾기 (확장자 추출)
  else if (characterId) {
    // Extract extension from original URL (png, jpg, etc.)
    let extension = 'jpg'; // default
    if (imageUrl) {
      const extMatch = imageUrl.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
      if (extMatch && extMatch[1]) {
        extension = extMatch[1].toLowerCase();
      }
    }
    finalUrl = `${IMAGE_BASE_URL}/images/characters/${characterId}.${extension}`;
  }
  // Priority 3: imageUrl에서 AniList character ID 추출 시도
  else if (imageUrl && imageUrl.includes('anilist.co') && imageUrl.includes('/character/')) {
    const match = imageUrl.match(/\/b(\d+)-/);
    if (match && match[1]) {
      const anilistCharacterId = match[1];
      // Extract extension from URL
      const extMatch = imageUrl.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
      const extension = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : 'jpg';
      finalUrl = `${IMAGE_BASE_URL}/images/characters/${anilistCharacterId}.${extension}`;
    } else {
      finalUrl = null;
    }
  }
  // Priority 4: imageUrl을 그대로 사용
  else if (imageUrl) {
    if (imageUrl.startsWith('http')) {
      finalUrl = imageUrl;
    } else if (imageUrl.startsWith('/')) {
      finalUrl = `${IMAGE_BASE_URL}${imageUrl}`;
    } else {
      finalUrl = `${IMAGE_BASE_URL}${imageUrl}`;
    }
  } else {
    return '/placeholder-anime.svg';
  }

  if (!finalUrl) return '/placeholder-anime.svg';

  return finalUrl;
};

/**
 * Get fallback image URL for character
 * Used in onError handler when R2 image fails
 * @param {string|null} imageUrl - External or database image URL
 * @param {string|null} currentSrc - Current src that failed (to try alternate extension)
 * @returns {string} Fallback image URL
 */
export const getCharacterImageFallback = (imageUrl, currentSrc = null) => {
  // If current src is R2 with one extension, try the other extension
  if (currentSrc && currentSrc.includes('/images/characters/')) {
    if (currentSrc.endsWith('.jpg')) {
      // Try .png
      return currentSrc.replace(/\.jpg$/, '.png');
    } else if (currentSrc.endsWith('.png')) {
      // Try .jpg
      return currentSrc.replace(/\.png$/, '.jpg');
    }
  }

  // Fallback to original URL
  if (!imageUrl) return '/placeholder-anime.svg';
  if (imageUrl.startsWith('http')) return imageUrl;
  return '/placeholder-anime.svg';
};

/**
 * Get avatar URL (for user profile pictures)
 * Strategy: Support both uploads and character avatars
 * @param {string|null} avatarUrl - Avatar URL from user object
 * @param {number|null} characterId - Optional character ID for R2 lookup
 * @returns {string} Avatar URL
 */
export const getAvatarUrl = (avatarUrl, characterId = null) => {
  if (!avatarUrl) return null;

  // 외부 URL은 그대로 사용하되, character ID가 있으면 R2 우선
  if (avatarUrl.startsWith('http')) {
    // If we have character ID, try R2 first (will fallback in onError)
    if (characterId) {
      return `${IMAGE_BASE_URL}/images/characters/${characterId}.jpg`;
    }
    return avatarUrl;
  }

  // /uploads로 시작하면 API 서버 (파일 업로드)
  if (avatarUrl.startsWith('/uploads')) {
    return `${API_BASE_URL}${avatarUrl}`;
  }

  // /images로 시작하면 R2
  if (avatarUrl.startsWith('/images')) {
    return `${IMAGE_BASE_URL}${avatarUrl}`;
  }

  // 그 외는 IMAGE_BASE_URL
  return `${IMAGE_BASE_URL}${avatarUrl}`;
};

/**
 * Get avatar fallback URL
 * Used in onError handler
 * @param {string|null} avatarUrl - Original avatar URL
 * @returns {string|null} Fallback URL or null for gradient placeholder
 */
export const getAvatarFallback = (avatarUrl) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return avatarUrl;
  return null;
};

/**
 * Get character display name
 * Prefer English over Japanese/Native
 * @param {object} character - Character object
 * @returns {string} Display name
 */
export const getCharacterDisplayName = (character) => {
  if (!character) return '';

  // Prefer: name_full (English) > name_native (Japanese/Korean) > name_full
  if (character.name_full && !isJapanese(character.name_full)) {
    return character.name_full;
  }

  if (character.name_alternative) {
    return character.name_alternative;
  }

  return character.name_full || character.name_native || '';
};

/**
 * Check if string contains Japanese characters
 * @param {string} str
 * @returns {boolean}
 */
function isJapanese(str) {
  if (!str) return false;
  // Check for Hiragana, Katakana, Kanji
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(str);
}
