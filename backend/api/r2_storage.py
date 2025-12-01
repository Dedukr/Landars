"""
Cloudflare R2 Storage utilities for product images.
"""

import io
import uuid
from datetime import datetime

import boto3
from botocore.client import Config
from django.conf import settings
from PIL import Image


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
            read_timeout=30,  # 30 seconds read timeout
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


def generate_presigned_upload_url(object_key, content_type, expiration=None):
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
    if not object_key:
        return False

    try:
        r2_client = get_r2_client()
        r2_client.delete_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=object_key,
        )
        print(f"Deleted from R2: {object_key}")
        return True
    except Exception as e:
        print(f"Error deleting image from R2 ({object_key}): {e}")
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


def compress_image(
    image_file, max_width=1920, max_height=1920, quality=85, format="JPEG"
):
    """
    Compress and optimize an image file.

    Args:
        image_file: File-like object or bytes containing the image
        max_width: Maximum width for the image (default: 1920px)
        max_height: Maximum height for the image (default: 1920px)
        quality: JPEG quality (1-100, default: 85)
        format: Output format ('JPEG', 'PNG', 'WEBP', default: 'JPEG')

    Returns:
        tuple: (compressed_image_bytes, content_type, original_size, compressed_size)
    """
    try:
        # Get original size before processing
        if isinstance(image_file, bytes):
            original_size = len(image_file)
            image = Image.open(io.BytesIO(image_file))
        else:
            # For file-like objects, get size first
            if hasattr(image_file, "size"):
                original_size = image_file.size
            else:
                # Read to get size
                current_pos = image_file.tell() if hasattr(image_file, "tell") else 0
                image_file.seek(0)
                content = image_file.read()
                original_size = len(content)
                image_file.seek(current_pos)

            image = Image.open(image_file)
            # Reset file pointer if it's a file object
            if hasattr(image_file, "seek"):
                image_file.seek(0)

        # Convert RGBA to RGB for JPEG format
        if format == "JPEG" and image.mode in ("RGBA", "LA", "P"):
            # Create a white background
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(
                image, mask=image.split()[-1] if image.mode == "RGBA" else None
            )
            image = background
        elif format == "JPEG" and image.mode != "RGB":
            image = image.convert("RGB")

        # Resize if image is larger than max dimensions
        if image.width > max_width or image.height > max_height:
            image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

        # Save compressed image to bytes
        output = io.BytesIO()

        if format == "JPEG":
            image.save(output, format="JPEG", quality=quality, optimize=True)
            content_type = "image/jpeg"
        elif format == "PNG":
            image.save(output, format="PNG", optimize=True)
            content_type = "image/png"
        elif format == "WEBP":
            image.save(output, format="WEBP", quality=quality, method=6)
            content_type = "image/webp"
        else:
            # Default to JPEG
            image.save(output, format="JPEG", quality=quality, optimize=True)
            content_type = "image/jpeg"

        compressed_bytes = output.getvalue()
        compressed_size = len(compressed_bytes)

        return compressed_bytes, content_type, original_size, compressed_size

    except Exception as e:
        raise ValueError(f"Error compressing image: {str(e)}")


def upload_compressed_image_to_r2(
    image_file, filename, product_id, max_width=1920, max_height=1920, quality=85
):
    """
    Compress an image and upload it directly to R2 storage.

    Args:
        image_file: File-like object or bytes containing the image
        filename: Original filename (used for extension detection)
        product_id: Product ID for organizing files
        max_width: Maximum width for compression (default: 1920px)
        max_height: Maximum height for compression (default: 1920px)
        quality: JPEG quality (1-100, default: 85)

    Returns:
        dict: Contains public_url, object_key, original_size, compressed_size, compression_ratio
    """
    # Determine output format based on filename extension
    filename_lower = filename.lower()
    if filename_lower.endswith(".png"):
        output_format = "PNG"
    elif filename_lower.endswith(".webp"):
        output_format = "WEBP"
    else:
        output_format = "JPEG"

    # Compress the image
    compressed_bytes, content_type, original_size, compressed_size = compress_image(
        image_file,
        max_width=max_width,
        max_height=max_height,
        quality=quality,
        format=output_format,
    )

    # Update filename extension if format changed
    if output_format == "JPEG" and not filename_lower.endswith((".jpg", ".jpeg")):
        filename = filename.rsplit(".", 1)[0] + ".jpg"
    elif output_format == "PNG" and not filename_lower.endswith(".png"):
        filename = filename.rsplit(".", 1)[0] + ".png"
    elif output_format == "WEBP" and not filename_lower.endswith(".webp"):
        filename = filename.rsplit(".", 1)[0] + ".webp"

    # Generate unique object key
    object_key = generate_unique_object_key(filename, product_id)

    # Upload to R2
    r2_client = get_r2_client()
    r2_client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=object_key,
        Body=compressed_bytes,
        ContentType=content_type,
    )

    # Generate public URL
    public_url = f"{settings.R2_PUBLIC_URL}/{object_key}"

    # Calculate compression ratio
    compression_ratio = (
        ((original_size - compressed_size) / original_size * 100)
        if original_size > 0
        else 0
    )

    return {
        "public_url": public_url,
        "object_key": object_key,
        "content_type": content_type,
        "original_size": original_size,
        "compressed_size": compressed_size,
        "compression_ratio": round(compression_ratio, 2),
    }
