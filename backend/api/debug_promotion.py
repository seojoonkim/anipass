"""
Debug API to find activities around rank promotions
승급 전후 활동 찾기
"""
from fastapi import APIRouter, HTTPException
from database import db

router = APIRouter()


@router.get("/trace-promotion/{user_id}/{target_score}")
def trace_promotion(user_id: int, target_score: int):
    """
    Find the exact activity that triggered a promotion
    특정 점수(승급)를 트리거한 활동 찾기
    """

    # Get all activities in chronological order
    anime_ratings = db.execute_query(
        '''
        SELECT ur.updated_at, 'anime_rating', a.title_romaji, a.title_korean
        FROM user_ratings ur
        JOIN anime a ON ur.anime_id = a.id
        WHERE ur.user_id = ? AND ur.status = 'RATED'
        ORDER BY ur.updated_at ASC
        ''',
        (user_id,)
    )

    character_ratings = db.execute_query(
        '''
        SELECT cr.updated_at, 'character_rating', c.name_full, c.name_native
        FROM character_ratings cr
        JOIN character c ON cr.character_id = c.id
        WHERE cr.user_id = ?
        ORDER BY cr.updated_at ASC
        ''',
        (user_id,)
    )

    anime_reviews = db.execute_query(
        '''
        SELECT r.created_at, 'anime_review', a.title_romaji, a.title_korean
        FROM user_reviews r
        JOIN anime a ON r.anime_id = a.id
        WHERE r.user_id = ?
        ORDER BY r.created_at ASC
        ''',
        (user_id,)
    )

    character_reviews = db.execute_query(
        '''
        SELECT cr.created_at, 'character_review', c.name_full, c.name_native
        FROM character_reviews cr
        JOIN character c ON cr.character_id = c.id
        WHERE cr.user_id = ?
        ORDER BY cr.created_at ASC
        ''',
        (user_id,)
    )

    # Merge and sort
    activities = sorted(
        list(anime_ratings) + list(character_ratings) + list(anime_reviews) + list(character_reviews),
        key=lambda x: x[0]
    )

    # Calculate cumulative score and find activities around target
    cumulative_anime = 0
    cumulative_char = 0
    cumulative_reviews = 0

    result = {
        'target_score': target_score,
        'activities_before': [],
        'trigger_activity': None,
        'activities_after': []
    }

    for i, activity in enumerate(activities):
        time, type_, title, title_kr = activity

        # Update counts
        if type_ == 'anime_rating':
            cumulative_anime += 1
        elif type_ == 'character_rating':
            cumulative_char += 1
        elif type_ in ['anime_review', 'character_review']:
            cumulative_reviews += 1

        score = cumulative_anime * 2 + cumulative_char * 1 + cumulative_reviews * 5

        activity_data = {
            'time': time,
            'type': type_,
            'title': title,
            'title_korean': title_kr,
            'score_after': score
        }

        # Find activities around target score
        if score < target_score - 10:
            continue
        elif score < target_score:
            result['activities_before'].append(activity_data)
        elif score == target_score:
            result['trigger_activity'] = activity_data
            result['trigger_activity']['anime_count'] = cumulative_anime
            result['trigger_activity']['char_count'] = cumulative_char
            result['trigger_activity']['review_count'] = cumulative_reviews
            # Add next few activities
            for j in range(i+1, min(i+4, len(activities))):
                next_act = activities[j]
                result['activities_after'].append({
                    'time': next_act[0],
                    'type': next_act[1],
                    'title': next_act[2],
                    'title_korean': next_act[3]
                })
            break
        elif score > target_score and not result['trigger_activity']:
            # We passed the target without hitting it exactly
            result['trigger_activity'] = activity_data
            result['trigger_activity']['anime_count'] = cumulative_anime
            result['trigger_activity']['char_count'] = cumulative_char
            result['trigger_activity']['review_count'] = cumulative_reviews
            result['note'] = f'Score jumped from {score - (2 if type_ == "anime_rating" else 1 if type_ == "character_rating" else 5)} to {score}'
            break

    return result


@router.get("/check-promotions/{user_id}")
def check_promotions(user_id: int):
    """
    Check all rank promotions with metadata
    모든 승급 메시지와 metadata 확인
    """
    promotions = db.execute_query(
        """
        SELECT id, user_id, activity_type, activity_time, metadata
        FROM activities
        WHERE user_id = ? AND activity_type = 'rank_promotion'
        ORDER BY activity_time DESC
        """,
        (user_id,)
    )

    return {
        'count': len(promotions),
        'promotions': [
            {
                'id': p[0],
                'user_id': p[1],
                'activity_type': p[2],
                'activity_time': p[3],
                'metadata': p[4]
            }
            for p in promotions
        ]
    }


@router.get("/check-status/{user_id}")
def check_user_status(user_id: int):
    """
    Check current user stats, recent activities, and all promotions
    현재 사용자 통계, 최근 활동, 모든 승급 확인
    """
    # Get database time
    db_time = db.execute_query("SELECT datetime('now') as current_time", fetch_one=True)

    # Get current stats
    anime_count = db.execute_query(
        "SELECT COUNT(*) as total FROM user_ratings WHERE user_id = ? AND status = 'RATED'",
        (user_id,),
        fetch_one=True
    )['total']

    char_count = db.execute_query(
        "SELECT COUNT(*) as total FROM character_ratings WHERE user_id = ?",
        (user_id,),
        fetch_one=True
    )['total']

    anime_review_count = db.execute_query(
        "SELECT COUNT(*) as total FROM user_reviews WHERE user_id = ?",
        (user_id,),
        fetch_one=True
    )['total']

    char_review_count = db.execute_query(
        "SELECT COUNT(*) as total FROM character_reviews WHERE user_id = ?",
        (user_id,),
        fetch_one=True
    )['total']

    total_reviews = anime_review_count + char_review_count
    score = anime_count * 2 + char_count * 1 + total_reviews * 5

    # Get last 30 activities
    recent_activities = db.execute_query(
        """
        SELECT activity_time, activity_type,
               CASE
                   WHEN activity_type = 'anime_rating' THEN (SELECT title_romaji FROM anime WHERE id = anime_id)
                   WHEN activity_type = 'character_rating' THEN (SELECT name_full FROM character WHERE id = character_id)
                   WHEN activity_type = 'rank_promotion' THEN metadata
                   ELSE NULL
               END as title
        FROM activities
        WHERE user_id = ?
        ORDER BY activity_time DESC
        LIMIT 30
        """,
        (user_id,)
    )

    # Get all promotions
    promotions = db.execute_query(
        """
        SELECT activity_time, metadata
        FROM activities
        WHERE user_id = ? AND activity_type = 'rank_promotion'
        ORDER BY activity_time ASC
        """,
        (user_id,)
    )

    return {
        'db_time': db_time['current_time'],
        'stats': {
            'anime_count': anime_count,
            'char_count': char_count,
            'anime_review_count': anime_review_count,
            'char_review_count': char_review_count,
            'total_reviews': total_reviews,
            'score': score
        },
        'recent_activities': [
            {
                'time': act[0],
                'type': act[1],
                'title': act[2] if act[2] else ''
            }
            for act in recent_activities
        ],
        'all_promotions': [
            {
                'time': promo[0],
                'rank': promo[1]
            }
            for promo in promotions
        ]
    }
