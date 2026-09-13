import { httpClient } from "@/utils/httpClient";
import { API_ENDPOINTS } from "@/config/api";

export const MAX_REVIEW_PHOTOS = 5;

export interface UploadedReviewImage {
  image_url: string;
  sort_order: number;
}

interface UploadResponse {
  public_url: string;
}

/**
 * Compress+upload a single image to Cloudflare R2 via the backend.
 * Uses folder ``reviews/temp`` until the review row exists.
 */
export async function uploadReviewImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("folder", "reviews/temp");

  const result = await httpClient.post<UploadResponse>(
    `/api${API_ENDPOINTS.IMAGES.UPLOAD}`,
    formData
  );
  if (!result?.public_url) {
    throw new Error("Upload succeeded but no public URL was returned.");
  }
  return result.public_url;
}

/** Upload multiple local files and return payload for the reviews API. */
export async function uploadReviewImages(
  files: File[],
  startSortOrder = 0
): Promise<UploadedReviewImage[]> {
  const urls: UploadedReviewImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const publicUrl = await uploadReviewImage(files[i]);
    urls.push({ image_url: publicUrl, sort_order: startSortOrder + i });
  }
  return urls;
}
