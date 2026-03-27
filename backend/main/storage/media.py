"""
storage/media.py — Object storage interface (S3/MinIO).
"""

import logging
from io import BytesIO

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

from config import settings

logger = logging.getLogger(__name__)


def _get_s3_client():
    """Build and return a boto3 S3 client from settings.

    Connects to MinIO locally and real S3 in production — controlled
    solely by S3_ENDPOINT_URL (empty → AWS default endpoints).
    """
    kwargs: dict = {
        "aws_access_key_id": settings.s3_access_key,
        "aws_secret_access_key": settings.s3_secret_key,
        "region_name": settings.s3_region,
        "config": Config(signature_version="s3v4"),
    }
    if settings.s3_endpoint_url_or_none:
        kwargs["endpoint_url"] = settings.s3_endpoint_url_or_none
    return boto3.client("s3", **kwargs)


def ensure_bucket_exists() -> None:
    """Create the storage bucket if it doesn't already exist.

    Safe to call at startup — idempotent when bucket already exists.
    """
    client = _get_s3_client()
    bucket = settings.s3_bucket_name
    try:
        client.head_bucket(Bucket=bucket)
        logger.debug("storage.bucket_exists bucket=%s", bucket)
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=bucket)
            logger.info("storage.bucket_created bucket=%s", bucket)
        else:
            raise


def upload_bytes(path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to object storage.

    Args:
        path:         S3 key, e.g. ``audio/story-abc123.mp3``
        data:         Raw file content
        content_type: MIME type for the stored object

    Returns:
        The path (S3 key) that was written, for storing in the database.
    """
    client = _get_s3_client()
    client.upload_fileobj(
        BytesIO(data),
        settings.s3_bucket_name,
        path,
        ExtraArgs={"ContentType": content_type},
    )
    logger.info("storage.upload_ok path=%s bytes=%d", path, len(data))
    return path


def get_presigned_url(path: str, expires_in: int = 3600) -> str:
    """Generate a time-limited pre-signed URL for a stored object.

    Args:
        path:       S3 key of the object
        expires_in: URL validity in seconds (default 1 hour)

    Returns:
        HTTPS URL that allows direct download without credentials.
    """
    client = _get_s3_client()
    url: str = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": path},
        ExpiresIn=expires_in,
    )
    logger.debug("storage.presigned_url path=%s expires_in=%d", path, expires_in)
    return url


def delete_object(path: str) -> bool:
    """Delete an object from S3/MinIO.

    Args:
        path: S3 key of the object to delete

    Returns:
        True if the call was successful (even if the object didn't exist).
    """
    client = _get_s3_client()
    try:
        client.delete_object(Bucket=settings.s3_bucket_name, Key=path)
        logger.info("storage.delete_ok path=%s", path)
        return True
    except ClientError as exc:
        logger.error("storage.delete_error path=%s exc=%s", path, exc)
        return False
