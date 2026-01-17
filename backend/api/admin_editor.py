"""
Admin Editor API - Content management interface
어드민 에디터 API - 애니메이션/캐릭터 관리
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from database import db
from api.auth import get_current_user
from utils.r2_storage import upload_file_bytes_to_r2, is_r2_configured, delete_from_r2, extract_object_key_from_url
import os
import shutil
from datetime import datetime

router = APIRouter()


class AnimeUpdate(BaseModel):
    title_korean: Optional[str] = None
    title_romaji: Optional[str] = None
    title_english: Optional[str] = None
    title_native: Optional[str] = None
    cover_image: Optional[str] = None  # 이미지 URL/경로


class CharacterUpdate(BaseModel):
    name_korean: Optional[str] = None
    name_full: Optional[str] = None
    name_native: Optional[str] = None
    image_large: Optional[str] = None  # 이미지 URL/경로


def require_simon(current_user = Depends(get_current_user)):
    """Require simon user"""
    if current_user.username != "simon":
        raise HTTPException(status_code=403, detail="Admin access only")
    return current_user


@router.get("/search")
def search_content(
    q: str,
    type: str = "both",
    limit: int = 20,
    current_user = Depends(require_simon)
):
    """
    검색 - 애니메이션 또는 캐릭터
    type: anime, character, both
    """
    results = {"anime": [], "characters": []}

    if type in ["anime", "both"]:
        # 애니메이션 검색 (모든 언어)
        anime_query = """
            SELECT
                id, title_korean, title_romaji, title_english, title_native,
                COALESCE(cover_image_url, cover_image_local) as cover_image,
                format, episodes, status, season_year
            FROM anime
            WHERE title_korean LIKE ?
               OR title_romaji LIKE ?
               OR title_english LIKE ?
               OR title_native LIKE ?
            ORDER BY popularity DESC
            LIMIT ?
        """
        pattern = f"%{q}%"
        anime_results = db.execute_query(
            anime_query,
            (pattern, pattern, pattern, pattern, limit)
        )

        results["anime"] = [
            {
                "id": row[0],
                "title_korean": row[1],
                "title_romaji": row[2],
                "title_english": row[3],
                "title_native": row[4],
                "cover_image": row[5],
                "format": row[6],
                "episodes": row[7],
                "status": row[8],
                "season_year": row[9]
            }
            for row in anime_results
        ]

    if type in ["character", "both"]:
        # 캐릭터 검색 (모든 언어)
        char_query = """
            SELECT
                c.id, c.name_korean, c.name_full, c.name_native,
                COALESCE(c.image_url, c.image_local) as image_large,
                c.favourites,
                a.id as anime_id, a.title_korean as anime_title
            FROM character c
            LEFT JOIN anime_character ac ON c.id = ac.character_id
            LEFT JOIN anime a ON ac.anime_id = a.id
            WHERE c.name_korean LIKE ?
               OR c.name_full LIKE ?
               OR c.name_native LIKE ?
            GROUP BY c.id
            ORDER BY c.favourites DESC
            LIMIT ?
        """
        pattern = f"%{q}%"
        char_results = db.execute_query(
            char_query,
            (pattern, pattern, pattern, limit)
        )

        results["characters"] = [
            {
                "id": row[0],
                "name_korean": row[1],
                "name_full": row[2],
                "name_native": row[3],
                "image_large": row[4],
                "favourites": row[5],
                "anime_id": row[6],
                "anime_title": row[7]
            }
            for row in char_results
        ]

        # Debug: Log search results
        for char in results["characters"]:
            print(f"[Search] Character {char['id']}: image_large = {char['image_large']}")

    return results


@router.get("/anime/{anime_id}")
def get_anime_detail(
    anime_id: int,
    current_user = Depends(require_simon)
):
    """애니메이션 상세 정보"""
    query = """
        SELECT
            id, title_korean, title_romaji, title_english, title_native,
            COALESCE(cover_image_url, cover_image_local) as cover_image,
            COALESCE(cover_image_url, cover_image_local) as cover_image_large,
            banner_image_url as banner_image,
            format, episodes, status, season, season_year,
            description, average_score, popularity
        FROM anime
        WHERE id = ?
    """
    result = db.execute_query(query, (anime_id,))

    if not result:
        raise HTTPException(status_code=404, detail="Anime not found")

    row = result[0]
    return {
        "id": row[0],
        "title_korean": row[1],
        "title_romaji": row[2],
        "title_english": row[3],
        "title_native": row[4],
        "cover_image": row[5],
        "cover_image_large": row[6],
        "banner_image": row[7],
        "format": row[8],
        "episodes": row[9],
        "status": row[10],
        "season": row[11],
        "season_year": row[12],
        "description": row[13],
        "average_score": row[14],
        "popularity": row[15]
    }


@router.patch("/anime/{anime_id}")
def update_anime(
    anime_id: int,
    data: AnimeUpdate,
    current_user = Depends(require_simon)
):
    """애니메이션 정보 수정"""
    # 업데이트할 필드만 선택
    updates = {}
    if data.title_korean is not None:
        updates["title_korean"] = data.title_korean
    if data.title_romaji is not None:
        updates["title_romaji"] = data.title_romaji
    if data.title_english is not None:
        updates["title_english"] = data.title_english
    if data.title_native is not None:
        updates["title_native"] = data.title_native
    if data.cover_image is not None:
        # 이미지 URL인 경우 cover_image_url, 로컬 경로인 경우 cover_image_local
        if data.cover_image.startswith('http'):
            updates["cover_image_url"] = data.cover_image
        else:
            updates["cover_image_local"] = data.cover_image

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # SQL 생성
    set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
    values = list(updates.values()) + [anime_id]

    query = f"""
        UPDATE anime
        SET {set_clause}
        WHERE id = ?
    """

    db.execute_update(query, tuple(values))

    return {"message": "Anime updated successfully", "updated_fields": list(updates.keys())}


@router.get("/character/{character_id}")
def get_character_detail(
    character_id: int,
    current_user = Depends(require_simon)
):
    """캐릭터 상세 정보"""
    query = """
        SELECT
            c.id, c.name_korean, c.name_full, c.name_native, c.name_alternative,
            COALESCE(c.image_url, c.image_local) as image_medium,
            COALESCE(c.image_url, c.image_local) as image_large,
            c.gender, c.age, c.description, c.favourites,
            a.id as anime_id, a.title_korean as anime_title
        FROM character c
        LEFT JOIN anime_character ac ON c.id = ac.character_id
        LEFT JOIN anime a ON ac.anime_id = a.id
        WHERE c.id = ?
        LIMIT 1
    """
    result = db.execute_query(query, (character_id,))

    if not result:
        raise HTTPException(status_code=404, detail="Character not found")

    row = result[0]
    return {
        "id": row[0],
        "name_korean": row[1],
        "name_full": row[2],
        "name_native": row[3],
        "name_alternative": row[4],
        "image_medium": row[5],
        "image_large": row[6],
        "gender": row[7],
        "age": row[8],
        "description": row[9],
        "favourites": row[10],
        "anime_id": row[11],
        "anime_title": row[12]
    }


@router.patch("/character/{character_id}")
def update_character(
    character_id: int,
    data: CharacterUpdate,
    current_user = Depends(require_simon)
):
    """캐릭터 정보 수정"""
    print(f"[Admin Editor] Updating character {character_id}")
    print(f"[Admin Editor] Received data: {data}")
    print(f"[Admin Editor] data.image_large = {data.image_large}")

    # 업데이트할 필드만 선택
    updates = {}
    if data.name_korean is not None:
        updates["name_korean"] = data.name_korean
    if data.name_full is not None:
        updates["name_full"] = data.name_full
    if data.name_native is not None:
        updates["name_native"] = data.name_native
    if data.image_large is not None:
        print(f"[Admin Editor] Image URL: {data.image_large}")
        # 이미지 URL인 경우 image_url, 로컬 경로인 경우 image_local
        if data.image_large.startswith('http'):
            updates["image_url"] = data.image_large
            print(f"[Admin Editor] Setting image_url to: {data.image_large}")
        else:
            updates["image_local"] = data.image_large
            print(f"[Admin Editor] Setting image_local to: {data.image_large}")

    print(f"[Admin Editor] Updates to apply: {updates}")

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # SQL 생성
    set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
    values = list(updates.values()) + [character_id]

    query = f"""
        UPDATE character
        SET {set_clause}
        WHERE id = ?
    """

    print(f"[Admin Editor] SQL query: {query}")
    print(f"[Admin Editor] SQL values: {values}")

    db.execute_update(query, tuple(values))

    # Verify update
    verify_result = db.execute_query(
        "SELECT image_url, image_local FROM character WHERE id = ?",
        (character_id,)
    )
    if verify_result:
        print(f"[Admin Editor] After update - image_url: {verify_result[0][0]}, image_local: {verify_result[0][1]}")

    # activities 테이블도 업데이트 (캐릭터 이름 변경 시)
    if "name_korean" in updates:
        db.execute_update("""
            UPDATE activities
            SET item_title_korean = ?
            WHERE activity_type IN ('character_rating', 'character_review')
              AND item_id = ?
        """, (updates["name_korean"], character_id))

    return {"message": "Character updated successfully", "updated_fields": list(updates.keys())}


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    type: str = "character",  # anime or character
    item_id: Optional[int] = None,
    current_user = Depends(require_simon)
):
    """이미지 업로드 (Cloudflare R2)"""
    # 파일 확장자 확인
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )

    # 파일 내용 읽기
    file_bytes = await file.read()

    # MIME 타입은 항상 JPEG (크롭 모달에서 JPEG로 변환됨)
    content_type = 'image/jpeg'

    try:
        # 기존 이미지 삭제 (item_id가 있는 경우)
        if item_id and is_r2_configured():
            # DB에서 기존 이미지 URL 조회
            if type == "character":
                query = "SELECT image_url, image_local FROM character WHERE id = ?"
            else:  # anime
                query = "SELECT cover_image_url, cover_image_local FROM anime WHERE id = ?"

            result = db.execute_query(query, (item_id,))
            if result:
                old_image_url = result[0][0] or result[0][1]
                if old_image_url:
                    old_object_key = extract_object_key_from_url(old_image_url)
                    if old_object_key:
                        try:
                            delete_from_r2(old_object_key)
                            print(f"[Admin Editor] Deleted old image: {old_object_key}")
                        except Exception as e:
                            print(f"[Admin Editor] Failed to delete old image: {e}")

        if is_r2_configured():
            # item_id를 파일명으로 사용 (항상 .jpg로 저장)
            if item_id:
                if type == "character":
                    object_key = f"images/characters/{item_id}.jpg"
                else:  # anime
                    object_key = f"images/covers/{item_id}.jpg"
            else:
                # item_id가 없으면 타임스탬프 사용 (fallback)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                if type == "character":
                    object_key = f"images/characters/upload_{timestamp}.jpg"
                else:
                    object_key = f"images/covers/upload_{timestamp}.jpg"

            file_url = upload_file_bytes_to_r2(
                file_bytes=file_bytes,
                object_key=object_key,
                content_type=content_type
            )
            storage_type = "R2"
        else:
            # 로컬 저장 (개발 환경 fallback)
            if item_id:
                filename = f"{item_id}.jpg"
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{timestamp}_{file.filename}"

            upload_dir = f"uploads/admin/{type}"
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, filename)

            with open(file_path, "wb") as buffer:
                buffer.write(file_bytes)

            file_url = f"/{file_path}"
            storage_type = "local"

        return {
            "message": "File uploaded successfully",
            "url": file_url,
            "storage": storage_type
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )


class DeleteImageRequest(BaseModel):
    image_url: str


@router.delete("/delete-image")
async def delete_image(
    data: DeleteImageRequest,
    current_user = Depends(require_simon)
):
    """R2에서 이미지 삭제"""
    try:
        # URL에서 object key 추출
        object_key = extract_object_key_from_url(data.image_url)

        if not object_key:
            raise HTTPException(
                status_code=400,
                detail="Invalid image URL"
            )

        # R2에서 삭제
        if is_r2_configured():
            success = delete_from_r2(object_key)
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to delete from R2"
                )

        return {
            "message": "Image deleted successfully",
            "object_key": object_key
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Delete failed: {str(e)}"
        )
