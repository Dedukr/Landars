"use client";

import Image from "next/image";
import {
  formatFestivalMoney,
  type FestivalMenuFilling,
  type FestivalMenuProduct,
} from "@/lib/festivalMenuApi";
import {
  fillingChoiceLabel,
  groupCrepeFillings,
  productImageKey,
} from "../utils";

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
  const choiceLabel = hasFillings
    ? fillingChoiceLabel(product.name, product.fillings)
    : null;
  const crepeGroups = hasFillings ? groupCrepeFillings(product) : null;

  return (
    <article className="festival-menu-card">
      {showImage ? (
        <div className="festival-menu-card-media">
          <Image
            src={product.image}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1120px) 360px, (min-width: 700px) 45vw, 92vw"
            priority={priority}
            unoptimized
            onError={() => onImageError(imageKey)}
          />
        </div>
      ) : (
        <div
          className="festival-menu-card-media festival-menu-card-media--placeholder"
        >
          <span className="festival-menu-card-media-label">Photo unavailable</span>
        </div>
      )}

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

        {hasFillings && choiceLabel ? (
          <div className="festival-menu-card-choices">
            <p className="festival-menu-card-choice-label">{choiceLabel}</p>
            {crepeGroups ? (
              <>
                {crepeGroups.savoury.length > 0 ? (
                  <ChoiceGroup
                    sublabel="Savoury"
                    fillings={crepeGroups.savoury}
                    product={product}
                    brokenImages={brokenImages}
                    onImageError={onImageError}
                  />
                ) : null}
                {crepeGroups.sweet.length > 0 ? (
                  <ChoiceGroup
                    sublabel="Sweet"
                    fillings={crepeGroups.sweet}
                    product={product}
                    brokenImages={brokenImages}
                    onImageError={onImageError}
                  />
                ) : null}
              </>
            ) : (
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
            )}
          </div>
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

        <p className="festival-menu-card-detail">
          <span className="festival-menu-card-detail-label">Ingredients</span>
          <span className="festival-menu-card-detail-sep" aria-hidden>
            {" "}
            ·{" "}
          </span>
          {product.ingredients?.trim() || "Not listed"}
        </p>

        <p className="festival-menu-card-allergens">
          <span className="festival-menu-card-detail-label">Allergens</span>
          <span className="festival-menu-card-detail-sep" aria-hidden>
            {" "}
            :{" "}
          </span>
          {product.allergens?.trim() || "Not listed"}
        </p>
      </div>
    </article>
  );
}

function ChoiceGroup({
  sublabel,
  fillings,
  product,
  brokenImages,
  onImageError,
}: {
  sublabel: string;
  fillings: FestivalMenuFilling[];
  product: FestivalMenuProduct;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
}) {
  return (
    <div className="festival-menu-choice-group">
      <p className="festival-menu-choice-sublabel">{sublabel}</p>
      <ul className="festival-menu-choice-list" aria-label={`${sublabel} fillings`}>
        {fillings.map((filling) => (
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
  const hasDistinctImage =
    Boolean(filling.image) &&
    filling.image !== product.image &&
    !brokenImages[productImageKey(product.name, filling.name, filling.image)];
  const imageKey = productImageKey(product.name, filling.name, filling.image);

  return (
    <div className="festival-menu-choice-row">
      {hasDistinctImage ? (
        <span className="festival-menu-choice-thumb">
          <Image
            src={filling.image}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
            loading="lazy"
            unoptimized
            onError={() => onImageError(imageKey)}
          />
        </span>
      ) : null}
      <div className="festival-menu-choice-copy">
        <p className="festival-menu-choice-name">{filling.name}</p>
        {filling.description ? (
          <p className="festival-menu-choice-description">{filling.description}</p>
        ) : null}
        {filling.allergens?.trim() ? (
          <p className="festival-menu-choice-allergens">{filling.allergens}</p>
        ) : null}
      </div>
    </div>
  );
}
