import Image from "next/image";
import { FestivalWheatSprig } from "./FestivalMenuDecoration";

type FestivalMenuHeaderProps = {
  includedMealOffer?: string;
};

export function FestivalMenuHeader({ includedMealOffer }: FestivalMenuHeaderProps) {
  return (
    <div className="festival-menu-header">
      <div className="festival-menu-header-inner">
        <div className="festival-menu-masthead">
          <div className="festival-menu-brand">
            <Image
              src="/landars_food_logo.svg"
              alt=""
              width={48}
              height={48}
              priority
            />
            <span className="festival-menu-brand-name">Landar&apos;s Food</span>
          </div>
          <FestivalWheatSprig />
        </div>

        <h1 className="festival-menu-title">Festival Menu</h1>
        <p className="festival-menu-tagline">Authentic Ukrainian Street Food</p>

        {includedMealOffer ? (
          <p className="festival-menu-offer" role="note">
            {includedMealOffer}
          </p>
        ) : null}
      </div>
    </div>
  );
}
