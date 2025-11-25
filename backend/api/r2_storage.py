"""
Cloudflare R2 Storage utilities for product images.
"""
import uuid
from datetime import datetime

import boto3
from botocore.client import Config
from django.conf import settings


def get_r2_client():
    """Get a boto3 client configured for Cloudflare R2."""
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            connect_timeout=10,  # 10 seconds connection timeout
            read_timeout=30,     # 30 seconds read timeout
        ),
    )


def generate_unique_object_key(filename, product_id=None):
    """
    Generate a unique object key for R2 storage.
    Format: products/{product_id}/{uuid}_{filename}
    If product_id is not provided: products/temp/{uuid}_{filename}
    """
    # Clean filename and get extension
    filename = filename.replace(" ", "_")
    unique_id = uuid.uuid4().hex
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if product_id:
        prefix = f"products/{product_id}"
    else:
        prefix = "products/temp"
    
    object_key = f"{prefix}/{timestamp}_{unique_id}_{filename}"
    return object_key


def generate_presigned_upload_url(
    object_key, content_type, expiration=None
):
    """
    Generate a presigned URL for uploading a file to R2.
    
    Args:
        object_key: The S3 object key (path) for the file
        content_type: The MIME type of the file
        expiration: URL expiration time in seconds (default from settings)
    
    Returns:
        dict: Contains presigned_url, public_url, object_key, and required_headers
    """
    if expiration is None:
        expiration = settings.PRESIGNED_URL_EXPIRATION
    
    r2_client = get_r2_client()
    
    # Generate presigned URL for PUT operation
    presigned_url = r2_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.R2_BUCKET_NAME,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=expiration,
    )
    
    # Generate public URL (using custom domain or R2 public URL)
    public_url = f"{settings.R2_PUBLIC_URL}/{object_key}"
    
    return {
        "presigned_url": presigned_url,
        "public_url": public_url,
        "object_key": object_key,
        "required_headers": {
            "Content-Type": content_type,
        },
    }


def delete_image_from_r2(object_key):
    """
    Delete an image from R2 storage.
    
    Args:
        object_key: The S3 object key (path) of the file to delete
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        r2_client = get_r2_client()
        r2_client.delete_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=object_key,
        )
        return True
    except Exception as e:
        print(f"Error deleting image from R2: {e}")
        return False


def validate_image_type(content_type):
    """
    Validate that the content type is an allowed image type.
    
    Args:
        content_type: MIME type to validate
    
    Returns:
        bool: True if valid, False otherwise
    """
    return content_type in settings.ALLOWED_IMAGE_TYPES


def validate_image_size(size_bytes):
    """
    Validate that the image size is within limits.
    
    Args:
        size_bytes: File size in bytes
    
    Returns:
        bool: True if valid, False otherwise
    """
    return size_bytes <= settings.MAX_IMAGE_SIZE

