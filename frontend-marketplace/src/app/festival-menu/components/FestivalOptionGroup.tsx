import Image from "next/image";
import {
  formatFestivalMoney,
  type FestivalMenuAddition,
  type FestivalMenuFilling,
} from "@/lib/festivalMenuApi";
import { productImageKey } from "../utils";

type FillingOptionGroupProps = {
  label: string;
  productName: string;
  options: FestivalMenuFilling[];
  productImage: string;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
  ariaLabel: string;
  /** Smaller chips layout for product cards. */
  compact?: boolean;
};

export function FestivalFillingOptionGroup({
  label,
  productName,
  options,
  productImage,
  brokenImages,
  onImageError,
  ariaLabel,
  compact = false,
}: FillingOptionGroupProps) {
  if (compact) {
    return (
      <div className="festival-menu-option-group festival-menu-option-group--compact">
        <h4 className="festival-menu-option-group-label">{label}</h4>
        <ul className="festival-menu-filling-chips" aria-label={ariaLabel}>
          {options.map((filling) => (
            <li key={filling.name} className="festival-menu-filling-chip">
              {filling.name}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="festival-menu-option-group">
      <h4 className="festival-menu-option-group-label">{label}</h4>
      <ul className="festival-menu-option-list" aria-label={ariaLabel}>
        {options.map((filling) => {
          const image = filling.image || productImage;
          const imageKey = productImageKey(productName, filling.name, image);
          const showImage = Boolean(image) && !brokenImages[imageKey];

          return (
            <li key={filling.name} className="festival-menu-option">
              {showImage ? (
                <span className="festival-menu-option-thumb">
                  <Image
                    src={image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized
                    onError={() => onImageError(imageKey)}
                  />
                </span>
              ) : null}
              <span className="festival-menu-option-name">{filling.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type AdditionOptionGroupProps = {
  label: string;
  options: FestivalMenuAddition[];
  /** Align name and price in balanced rows (category add-ons band). */
  aligned?: boolean;
};

export function FestivalAdditionOptionGroup({
  label,
  options,
  aligned = false,
}: AdditionOptionGroupProps) {
  return (
    <div
      className={`festival-menu-option-group${aligned ? " festival-menu-option-group--aligned" : ""}`}
    >
      <h4 className="festival-menu-option-group-label">{label}</h4>
      <ul className="festival-menu-option-list" aria-label={label}>
        {options.map((addition) => (
          <li key={addition.name} className="festival-menu-option">
            <span className="festival-menu-option-name">{addition.name}</span>
            {Number(addition.price) > 0 ? (
              <span className="festival-menu-option-price">
                +{formatFestivalMoney(addition.price)}
              </span>
            ) : (
              <span className="festival-menu-option-included">Included</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TextOptionGroupProps = {
  label: string;
  text: string;
};

export function FestivalTextOptionGroup({ label, text }: TextOptionGroupProps) {
  return (
    <div className="festival-menu-option-group">
      <h4 className="festival-menu-option-group-label">{label}</h4>
      <p className="festival-menu-option-text">{text}</p>
    </div>
  );
}
