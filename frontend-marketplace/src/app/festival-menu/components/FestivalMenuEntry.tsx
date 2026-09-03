"use client";

import Image from "next/image";
import {
  formatFestivalMoney,
  type FestivalMenuFilling,
  type FestivalMenuProduct,
} from "@/lib/festivalMenuApi";
import { fillingChoiceLabel, productImageKey } from "../utils";

type FestivalMenuEntryProps = {
  product: FestivalMenuProduct;
  filling?: FestivalMenuFilling | null;
  /** Filling rows show image, name, description (with product fallback), and filling allergens. */
  fillingVariant?: boolean;
  imageSide?: "left" | "right";
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
};

export function FestivalMenuEntry({
  product,
  filling = null,
  fillingVariant = false,
  imageSide = "left",
  brokenImages,
  onImageError,
}: FestivalMenuEntryProps) {
  const image = filling?.image || product.image;
  const imageKey = productImageKey(product.name, filling?.name ?? null, image);
  const showImage = Boolean(image) && !brokenImages[imageKey];
  const displayName =
    fillingVariant && filling ? filling.name : product.name;
  const TitleTag = fillingVariant ? "h4" : "h3";
  const descriptionText = fillingVariant
    ? filling?.description || product.description
    : product.description;
  const allergensText = fillingVariant
    ? filling?.allergens ?? ""
    : product.allergens;

  return (
    <article
      className={`festival-menu-entry festival-menu-entry--image-${imageSide}${
        fillingVariant ? " festival-menu-entry--filling" : ""
      }`}
    >
      {showImage ? (
        <div className="festival-menu-entry-media">
          <Image
            src={image}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 768px) 180px, 120px"
            priority={!fillingVariant}
            unoptimized
            onError={() => onImageError(imageKey)}
          />
        </div>
      ) : (
        <div
          className="festival-menu-entry-media festival-menu-entry-media--placeholder"
          aria-hidden
        />
      )}

      <div className="festival-menu-entry-body">
        <header className="festival-menu-entry-headline">
          <TitleTag className="festival-menu-entry-name">{displayName}</TitleTag>
          {!fillingVariant ? (
            <span className="festival-menu-entry-price festival-menu-card-price">
              {formatFestivalMoney(product.price)}
            </span>
          ) : null}
        </header>

        {!fillingVariant && product.portion ? (
          <p className="festival-menu-entry-portion">{product.portion}</p>
        ) : null}

        {descriptionText ? (
          <p className="festival-menu-entry-description">{descriptionText}</p>
        ) : null}

        {!fillingVariant && product.toppings ? (
          <p className="festival-menu-entry-detail">
            <span className="festival-menu-entry-label">Sauces</span>
            <span className="festival-menu-entry-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {product.toppings}
          </p>
        ) : null}

        {!fillingVariant && product.ingredients ? (
          <p className="festival-menu-entry-detail">
            <span className="festival-menu-entry-label">Ingredients</span>
            <span className="festival-menu-entry-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {product.ingredients}
          </p>
        ) : null}

        {allergensText ? (
          <p className="festival-menu-entry-detail festival-menu-entry-allergens">
            <span className="festival-menu-entry-label">Allergens</span>
            <span className="festival-menu-entry-sep" aria-hidden>
              {" "}
              :{" "}
            </span>
            {allergensText}
          </p>
        ) : null}
      </div>
    </article>
  );
}

type FestivalMenuEntryGroupProps = {
  product: FestivalMenuProduct;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
};

/** Product with fillings — PDF-style intro, then fillings in one column. */
export function FestivalMenuEntryGroup({
  product,
  brokenImages,
  onImageError,
}: FestivalMenuEntryGroupProps) {
  const groupId = `product-${product.name.toLowerCase().replace(/\s+/g, "-")}`;
  const choiceLabel = fillingChoiceLabel(product.name, product.fillings);

  return (
    <div
      className="festival-menu-entry-group"
      aria-labelledby={`${groupId}-title`}
    >
      <header className="festival-menu-entry-group-header">
        <div className="festival-menu-entry-headline">
          <h3 id={`${groupId}-title`} className="festival-menu-entry-name">
            {product.name}
          </h3>
          <span className="festival-menu-entry-price festival-menu-card-price">
            {formatFestivalMoney(product.price)}
          </span>
        </div>

        {product.portion ? (
          <p className="festival-menu-entry-portion">{product.portion}</p>
        ) : null}

        <p className="festival-menu-entry-choice-label">{choiceLabel}</p>

        {product.toppings ? (
          <p className="festival-menu-entry-detail">
            <span className="festival-menu-entry-label">Sauces</span>
            <span className="festival-menu-entry-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {product.toppings}
          </p>
        ) : null}

        {product.ingredients ? (
          <p className="festival-menu-entry-detail">
            <span className="festival-menu-entry-label">Ingredients</span>
            <span className="festival-menu-entry-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {product.ingredients}
          </p>
        ) : null}
      </header>

      <ul className="festival-menu-filling-list" aria-label={`${product.name} fillings`}>
        {product.fillings.map((filling) => (
          <li key={filling.name}>
            <FestivalMenuEntry
              product={product}
              filling={filling}
              fillingVariant
              imageSide="left"
              brokenImages={brokenImages}
              onImageError={onImageError}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
