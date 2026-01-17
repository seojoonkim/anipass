"""
Cloudflare R2 Storage Utility
S3-compatible object storage for images
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
import mimetypes

# R2 Configuration from environment variables
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "anipass-images")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_PUBLIC_URL = os.getenv("IMAGE_BASE_URL", "https://images.anipass.io")

# Debug: Print R2 configuration on startup
print(f"[R2 Storage] Configuration loaded:")
print(f"  - R2_BUCKET_NAME: {R2_BUCKET_NAME}")
print(f"  - R2_ENDPOINT_URL: {R2_ENDPOINT_URL[:50] if R2_ENDPOINT_URL else 'NOT SET'}...")
print(f"  - R2_PUBLIC_URL (IMAGE_BASE_URL): {R2_PUBLIC_URL}")
print(f"  - R2_ACCESS_KEY_ID: {'SET' if R2_ACCESS_KEY_ID else 'NOT SET'}")
print(f"  - R2_SECRET_ACCESS_KEY: {'SET' if R2_SECRET_ACCESS_KEY else 'NOT SET'}")


def get_r2_client():
    """Get configured R2 S3 client"""
    if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL]):
        raise ValueError("R2 credentials not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT_URL")

    return boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name='auto'  # R2 uses 'auto' region
    )


def upload_to_r2(
    file_path: str,
    object_key: str,
    content_type: Optional[str] = None
) -> str:
    """
    Upload a file to R2

    Args:
        file_path: Local file path to upload
        object_key: S3 object key (path in bucket, e.g., "admin/anime/123.jpg")
        content_type: MIME type (auto-detected if not provided)

    Returns:
        Public URL of uploaded file
    """
    if not content_type:
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = 'application/octet-stream'

    try:
        s3_client = get_r2_client()

        with open(file_path, 'rb') as file_data:
            s3_client.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=object_key,
                Body=file_data,
                ContentType=content_type,
                CacheControl='public, max-age=31536000',  # 1 year cache
            )

        # Return public URL
        public_url = f"{R2_PUBLIC_URL}/{object_key}"
        return public_url

    except ClientError as e:
        raise Exception(f"Failed to upload to R2: {str(e)}")


def upload_file_bytes_to_r2(
    file_bytes: bytes,
    object_key: str,
    content_type: str = 'application/octet-stream'
) -> str:
    """
    Upload file bytes directly to R2 (without saving to disk first)

    Args:
        file_bytes: File content as bytes
        object_key: S3 object key
        content_type: MIME type

    Returns:
        Public URL of uploaded file
    """
    try:
        s3_client = get_r2_client()

        s3_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=object_key,
            Body=file_bytes,
            ContentType=content_type,
            CacheControl='public, max-age=3600, must-revalidate',  # 1시간 캐시, 재검증 필요
        )

        public_url = f"{R2_PUBLIC_URL}/{object_key}"
        return public_url

    except ClientError as e:
        raise Exception(f"Failed to upload to R2: {str(e)}")


def is_r2_configured() -> bool:
    """Check if R2 is properly configured"""
    return all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL])


def delete_from_r2(object_key: str) -> bool:
    """
    Delete a file from R2

    Args:
        object_key: S3 object key (e.g., "admin/anime/123.jpg")

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        s3_client = get_r2_client()
        s3_client.delete_object(
            Bucket=R2_BUCKET_NAME,
            Key=object_key
        )
        return True
    except ClientError as e:
        print(f"Failed to delete from R2: {str(e)}")
        return False


def extract_object_key_from_url(url: str) -> Optional[str]:
    """
    Extract R2 object key from public URL

    Args:
        url: Full URL (e.g., "https://images.anipass.io/admin/anime/123.jpg")

    Returns:
        Object key (e.g., "admin/anime/123.jpg") or None
    """
    if not url:
        return None

    # Remove R2_PUBLIC_URL prefix
    if url.startswith(R2_PUBLIC_URL):
        return url[len(R2_PUBLIC_URL):].lstrip('/')

    return None
