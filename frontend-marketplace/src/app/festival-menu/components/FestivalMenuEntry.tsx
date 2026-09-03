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
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
  /** Eager-load only the first 1–2 product photos on the page. */
  priority?: boolean;
};

export function FestivalMenuEntry({
  product,
  brokenImages,
  onImageError,
  priority = false,
}: FestivalMenuEntryProps) {
  const imageKey = productImageKey(product.name, null, product.image);
  const showImage = Boolean(product.image) && !brokenImages[imageKey];
  const hasFillings = product.fillings.length > 0;
  const manyFillings = product.fillings.length >= 4;
  const choiceLabel = hasFillings
    ? fillingChoiceLabel(product.name, product.fillings)
    : null;

  return (
    <article
      className={`festival-menu-card${
        hasFillings ? " festival-menu-card--with-fillings" : ""
      }${manyFillings ? " festival-menu-card--many-fillings" : ""}`}
    >
      {/* Suppress parent image when fillings carry the visual weight */}
      {!hasFillings &&
        (showImage ? (
          <div className="festival-menu-card-media">
            <Image
              src={product.image}
              alt=""
              fill
              className="object-cover"
              sizes="(min-width: 1120px) 280px, (min-width: 700px) 45vw, 92vw"
              priority={priority}
              unoptimized
              onError={() => onImageError(imageKey)}
            />
          </div>
        ) : (
          <div className="festival-menu-card-media festival-menu-card-media--placeholder">
            <span className="festival-menu-card-media-label">Photo unavailable</span>
          </div>
        ))}

      <div className="festival-menu-card-body">
        <div className="festival-menu-card-headline">
          <h3 className="festival-menu-card-name">{product.name}</h3>
          <span className="festival-menu-card-price">
            {formatFestivalMoney(product.price)}
          </span>
        </div>

        {product.portion ? (
          <p className="festival-menu-card-portion">{product.portion}</p>
        ) : null}

        {product.description ? (
          <p className="festival-menu-card-description">{product.description}</p>
        ) : null}

        {product.toppings ? (
          <p className="festival-menu-card-detail">
            <span className="festival-menu-card-detail-label">Sauces</span>
            <span className="festival-menu-card-detail-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {product.toppings}
          </p>
        ) : null}

        {hasFillings && choiceLabel ? (
          <div className="festival-menu-card-choices">
            <p className="festival-menu-card-choice-label">{choiceLabel}</p>
            <ul
              className="festival-menu-choice-list"
              aria-label={`${product.name} choices`}
            >
              {product.fillings.map((filling) => (
                <li key={filling.name}>
                  <ChoiceRow
                    filling={filling}
                    product={product}
                    brokenImages={brokenImages}
                    onImageError={onImageError}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!hasFillings && product.allergens?.trim() ? (
          <p className="festival-menu-card-allergens">
            <span className="festival-menu-card-detail-label">Allergens</span>
            <span className="festival-menu-card-detail-sep" aria-hidden>
              {" "}
              :{" "}
            </span>
            {product.allergens.trim()}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ChoiceRow({
  filling,
  product,
  brokenImages,
  onImageError,
}: {
  filling: FestivalMenuFilling;
  product: FestivalMenuProduct;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
}) {
  const image = filling.image || product.image;
  const imageKey = productImageKey(product.name, filling.name, image);
  const showImage = Boolean(image) && !brokenImages[imageKey];

  return (
    <div className="festival-menu-choice-row">
      {showImage ? (
        <span className="festival-menu-choice-media">
          <Image
            src={image}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1120px) 280px, (min-width: 700px) calc(50vw - 3rem), 92vw"
            loading="lazy"
            unoptimized
            onError={() => onImageError(imageKey)}
          />
        </span>
      ) : null}
      <div className="festival-menu-choice-copy">
        <p className="festival-menu-choice-name">{filling.name}</p>
        {filling.description?.trim() ? (
          <p className="festival-menu-choice-description">{filling.description}</p>
        ) : null}
        {filling.allergens?.trim() ? (
          <p className="festival-menu-choice-allergens">
            <span className="festival-menu-card-detail-label">Allergens</span>
            <span className="festival-menu-card-detail-sep" aria-hidden>
              {" "}
              :{" "}
            </span>
            {filling.allergens.trim()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
