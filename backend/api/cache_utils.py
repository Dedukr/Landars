"""Shared cache helpers: stable keys, stampede protection, generation invalidation."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Callable
from typing import Any, TypeVar

from django.core.cache import cache

logger = logging.getLogger(__name__)

T = TypeVar("T")

PRODUCTS_CACHE_GEN_KEY = "products_list_gen"
PRODUCTS_CACHE_VERSION = "v12"
CATEGORIES_LIST_CACHE_KEY = "categories_list_v7"
CATEGORY_GROUPS_LIST_CACHE_KEY = "category_groups_list_v3"


def stable_query_hash(query_params) -> str:
    """Process-stable hash for cache keys (unlike built-in hash())."""
    items = sorted((k, v) for k, v in query_params.items())
    normalized = json.dumps(items, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def products_list_cache_key(query_params) -> str:
    gen = get_products_cache_generation()
    query_hash = stable_query_hash(query_params)
    return f"products_{PRODUCTS_CACHE_VERSION}_{gen}_{query_hash}"


def get_products_cache_generation() -> int:
    try:
        gen = cache.get(PRODUCTS_CACHE_GEN_KEY)
    except Exception:
        logger.warning("Cache get failed for products generation", exc_info=True)
        return 1
    if gen is None:
        try:
            cache.set(PRODUCTS_CACHE_GEN_KEY, 1, timeout=86400 * 365)
        except Exception:
            logger.warning("Cache set failed for products generation", exc_info=True)
        return 1
    return int(gen)


def bump_products_cache_generation() -> None:
    current = get_products_cache_generation()
    try:
        cache.set(PRODUCTS_CACHE_GEN_KEY, current + 1, timeout=86400 * 365)
    except Exception:
        logger.warning("Failed to bump products cache generation", exc_info=True)


def safe_cache_get(key: str) -> Any:
    try:
        return cache.get(key)
    except Exception:
        logger.warning("Cache get failed for key %s", key, exc_info=True)
        return None


def safe_cache_set(key: str, value: Any, timeout: int | None) -> None:
    try:
        cache.set(key, value, timeout)
    except Exception:
        logger.warning("Cache set failed for key %s", key, exc_info=True)


def safe_cache_add(key: str, value: Any, timeout: int) -> bool:
    try:
        return cache.add(key, value, timeout)
    except Exception:
        logger.warning("Cache add failed for key %s", key, exc_info=True)
        return False


def safe_cache_delete(key: str) -> None:
    try:
        cache.delete(key)
    except Exception:
        logger.warning("Cache delete failed for key %s", key, exc_info=True)


def cache_get_or_compute(key: str, ttl: int, compute: Callable[[], T]) -> T:
    """
    Return cached value or compute once with single-flight lock (stampede protection).
    Falls back to compute() if cache is unavailable.
    """
    cached = safe_cache_get(key)
    if cached is not None:
        return cached

    lock_key = f"{key}:lock"
    if safe_cache_add(lock_key, 1, 30):
        try:
            value = compute()
            safe_cache_set(key, value, ttl)
            return value
        finally:
            safe_cache_delete(lock_key)

    for _ in range(3):
        time.sleep(0.05)
        cached = safe_cache_get(key)
        if cached is not None:
            return cached

    return compute()
