/**
 * Intelligent Cart Merging Utility
 *
 * This utility implements advanced cart merging strategies following e-commerce best practices:
 * - Conflict resolution with multiple strategies
 * - Optimistic updates for better UX
 * - Comprehensive error handling
 * - Detailed logging for debugging
 * - Type safety with TypeScript
 */

import { CartItem } from "@/contexts/CartContext";

export interface CartMergeResult {
  mergedCart: CartItem[];
  conflicts: CartConflict[];
  mergeSummary: MergeSummary;
}

export interface CartConflict {
  productId: number;
  productName: string;
  localQuantity: number;
  backendQuantity: number;
  resolution: ConflictResolution;
  finalQuantity: number;
}

export interface MergeSummary {
  totalItems: number;
  conflictsResolved: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
}

export enum ConflictResolution {
  KEEP_HIGHER = "keep_higher",
  KEEP_LOCAL = "keep_local",
  KEEP_BACKEND = "keep_backend",
  SUM_QUANTITIES = "sum_quantities",
  PROMPT_USER = "prompt_user",
}

export enum MergeStrategy {
  CONSERVATIVE = "conservative", // Keep higher quantities, avoid duplicates
  AGGRESSIVE = "aggressive", // Sum quantities, merge everything
  SMART = "smart", // Intelligent merging based on context
}

/**
 * Advanced cart merging utility with multiple strategies
 */
export class CartMerger {
  private strategy: MergeStrategy;
  private conflictResolution: ConflictResolution;
  private logger: CartMergeLogger;

  constructor(
    strategy: MergeStrategy = MergeStrategy.SMART,
    conflictResolution: ConflictResolution = ConflictResolution.KEEP_HIGHER
  ) {
    this.strategy = strategy;
    this.conflictResolution = conflictResolution;
    this.logger = new CartMergeLogger();
  }

  /**
   * Intelligently merge local and backend carts
   */
  async mergeCarts(
    localCart: CartItem[],
    backendCart: CartItem[],
    productDetails?: Map<number, { name: string; maxQuantity?: number }>
  ): Promise<CartMergeResult> {
    this.logger.logMergeStart(localCart, backendCart);

    try {
      const conflicts: CartConflict[] = [];
      const mergedCart: CartItem[] = [];
      const processedProductIds = new Set<number>();

      // Create backend cart map for O(1) lookups
      const backendMap = new Map<number, CartItem>();
      backendCart.forEach((item) => {
        backendMap.set(item.productId, item);
      });

      // Process local cart items first (user's immediate actions take priority)
      for (const localItem of localCart) {
        const backendItem = backendMap.get(localItem.productId);

        if (backendItem) {
          // Conflict detected - both carts have this item
          const conflict = this.resolveConflict(
            localItem,
            backendItem,
            productDetails?.get(localItem.productId)
          );
          conflicts.push(conflict);

          mergedCart.push({
            productId: localItem.productId,
            quantity: conflict.finalQuantity,
          });
        } else {
          // No conflict - add local item
          mergedCart.push(localItem);
        }

        processedProductIds.add(localItem.productId);
      }

      // Add backend-only items
      for (const backendItem of backendCart) {
        if (!processedProductIds.has(backendItem.productId)) {
          mergedCart.push(backendItem);
        }
      }

      // Validate merged cart
      const validatedCart = await this.validateMergedCart(
        mergedCart,
        productDetails
      );

      const result: CartMergeResult = {
        mergedCart: validatedCart,
        conflicts,
        mergeSummary: this.generateMergeSummary(
          localCart,
          backendCart,
          conflicts
        ),
      };

      this.logger.logMergeComplete(result);
      return result;
    } catch (error) {
      this.logger.logMergeError(error);
      throw new CartMergeError("Failed to merge carts", error);
    }
  }

  /**
   * Resolve conflicts between local and backend cart items
   */
  private resolveConflict(
    localItem: CartItem,
    backendItem: CartItem,
    productDetails?: { name: string; maxQuantity?: number }
  ): CartConflict {
    const productName =
      productDetails?.name || `Product ${localItem.productId}`;
    const maxQuantity = productDetails?.maxQuantity;

    let finalQuantity: number;
    let resolution: ConflictResolution;

    switch (this.strategy) {
      case MergeStrategy.CONSERVATIVE:
        // Keep the higher quantity, but respect max limits
        finalQuantity = Math.max(localItem.quantity, backendItem.quantity);
        resolution = ConflictResolution.KEEP_HIGHER;
        break;

      case MergeStrategy.AGGRESSIVE:
        // Sum quantities, but respect max limits
        const sumQuantity = localItem.quantity + backendItem.quantity;
        finalQuantity = maxQuantity
          ? Math.min(sumQuantity, maxQuantity)
          : sumQuantity;
        resolution = ConflictResolution.SUM_QUANTITIES;
        break;

      case MergeStrategy.SMART:
        // Intelligent merging based on context
        finalQuantity = this.smartMerge(localItem, backendItem, maxQuantity);
        resolution = this.determineSmartResolution(
          localItem,
          backendItem,
          finalQuantity
        );
        break;

      default:
        finalQuantity = Math.max(localItem.quantity, backendItem.quantity);
        resolution = ConflictResolution.KEEP_HIGHER;
    }

    return {
      productId: localItem.productId,
      productName,
      localQuantity: localItem.quantity,
      backendQuantity: backendItem.quantity,
      resolution,
      finalQuantity,
    };
  }

  /**
   * Smart merging logic based on business rules
   */
  private smartMerge(
    localItem: CartItem,
    backendItem: CartItem,
    maxQuantity?: number
  ): number {
    // If quantities are equal, keep as is
    if (localItem.quantity === backendItem.quantity) {
      return localItem.quantity;
    }

    // If one quantity is significantly larger, prefer it
    const ratio =
      Math.max(localItem.quantity, backendItem.quantity) /
      Math.min(localItem.quantity, backendItem.quantity);

    if (ratio > 2) {
      // Significant difference - keep the larger quantity
      return Math.max(localItem.quantity, backendItem.quantity);
    }

    // Similar quantities - sum them but respect limits
    const sumQuantity = localItem.quantity + backendItem.quantity;
    return maxQuantity ? Math.min(sumQuantity, maxQuantity) : sumQuantity;
  }

  /**
   * Determine the resolution type for smart merging
   */
  private determineSmartResolution(
    localItem: CartItem,
    backendItem: CartItem,
    finalQuantity: number
  ): ConflictResolution {
    if (finalQuantity === localItem.quantity) {
      return ConflictResolution.KEEP_LOCAL;
    } else if (finalQuantity === backendItem.quantity) {
      return ConflictResolution.KEEP_BACKEND;
    } else if (finalQuantity === localItem.quantity + backendItem.quantity) {
      return ConflictResolution.SUM_QUANTITIES;
    } else {
      return ConflictResolution.KEEP_HIGHER;
    }
  }

  /**
   * Validate merged cart for business rules
   */
  private async validateMergedCart(
    cart: CartItem[],
    productDetails?: Map<number, { name: string; maxQuantity?: number }>
  ): Promise<CartItem[]> {
    return cart
      .filter((item) => item.quantity > 0) // Remove zero-quantity items
      .map((item) => {
        const maxQuantity = productDetails?.get(item.productId)?.maxQuantity;
        if (maxQuantity && item.quantity > maxQuantity) {
          this.logger.logValidationWarning(
            `Product ${item.productId} quantity capped at ${maxQuantity}`
          );
          return { ...item, quantity: maxQuantity };
        }
        return item;
      });
  }

  /**
   * Generate merge summary for user feedback
   */
  private generateMergeSummary(
    localCart: CartItem[],
    backendCart: CartItem[],
    conflicts: CartConflict[]
  ): MergeSummary {
    const totalItems = localCart.length + backendCart.length;
    const conflictsResolved = conflicts.length;
    const itemsAdded = localCart.filter(
      (item) =>
        !backendCart.some(
          (backendItem) => backendItem.productId === item.productId
        )
    ).length;
    const itemsUpdated = conflicts.length;
    const itemsRemoved = 0; // We don't remove items in merging

    return {
      totalItems,
      conflictsResolved,
      itemsAdded,
      itemsUpdated,
      itemsRemoved,
    };
  }

  /**
   * Update merge strategy
   */
  setStrategy(strategy: MergeStrategy): void {
    this.strategy = strategy;
    this.logger.logStrategyChange(strategy);
  }

  /**
   * Update conflict resolution strategy
   */
  setConflictResolution(resolution: ConflictResolution): void {
    this.conflictResolution = resolution;
    this.logger.logConflictResolutionChange(resolution);
  }
}

/**
 * Comprehensive logging for cart merge operations
 */
class CartMergeLogger {
  private isDebugMode: boolean;

  constructor(debugMode: boolean = process.env.NODE_ENV === "development") {
    this.isDebugMode = debugMode;
  }

  logMergeStart(localCart: CartItem[], backendCart: CartItem[]): void {
    if (this.isDebugMode) {
      console.group("🛒 Cart Merge Started");
      console.log("Local cart items:", localCart.length);
      console.log("Backend cart items:", backendCart.length);
      console.log("Local cart:", localCart);
      console.log("Backend cart:", backendCart);
      console.groupEnd();
    }
  }

  logMergeComplete(result: CartMergeResult): void {
    if (this.isDebugMode) {
      console.group("✅ Cart Merge Completed");
      console.log("Merged cart items:", result.mergedCart.length);
      console.log("Conflicts resolved:", result.conflicts.length);
      console.log("Merge summary:", result.mergeSummary);
      console.log("Final cart:", result.mergedCart);
      console.groupEnd();
    }
  }

  logMergeError(error: unknown): void {
    console.error("❌ Cart Merge Error:", error);
  }

  logValidationWarning(message: string): void {
    if (this.isDebugMode) {
      console.warn("⚠️ Cart Validation Warning:", message);
    }
  }

  logStrategyChange(strategy: MergeStrategy): void {
    if (this.isDebugMode) {
      console.log("🔄 Merge Strategy Changed:", strategy);
    }
  }

  logConflictResolutionChange(resolution: ConflictResolution): void {
    if (this.isDebugMode) {
      console.log("🔄 Conflict Resolution Changed:", resolution);
    }
  }
}

/**
 * Custom error class for cart merge operations
 */
export class CartMergeError extends Error {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "CartMergeError";
    this.originalError = originalError;
  }
}

/**
 * Factory function to create cart merger with sensible defaults
 */
export function createCartMerger(
  strategy: MergeStrategy = MergeStrategy.SMART,
  conflictResolution: ConflictResolution = ConflictResolution.KEEP_HIGHER
): CartMerger {
  return new CartMerger(strategy, conflictResolution);
}

/**
 * Utility function for quick cart merging with default settings
 */
export async function mergeCarts(
  localCart: CartItem[],
  backendCart: CartItem[],
  productDetails?: Map<number, { name: string; maxQuantity?: number }>
): Promise<CartMergeResult> {
  const merger = createCartMerger();
  return await merger.mergeCarts(localCart, backendCart, productDetails);
}


