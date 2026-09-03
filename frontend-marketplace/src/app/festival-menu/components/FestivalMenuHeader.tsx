import Image from "next/image";

type FestivalMenuHeaderProps = {
  includedMealOffer?: string;
};

export function FestivalMenuHeader({ includedMealOffer }: FestivalMenuHeaderProps) {
  return (
    <header className="festival-menu-header">
      <div className="festival-menu-header-inner">
        <div className="festival-menu-brand">
          <Image
            src="/landars_food_logo.svg"
            alt=""
            width={44}
            height={44}
            priority
          />
          <span className="festival-menu-brand-name">Landar&apos;s Food</span>
        </div>

        <h1 className="festival-menu-title">Festival Menu</h1>
        <p className="festival-menu-tagline">Authentic Ukrainian street food</p>

        <p className="festival-menu-intro">
          Freshly prepared traditional Ukrainian street food, handmade with quality
          ingredients and authentic family recipes.
        </p>

        {includedMealOffer ? (
          <p className="festival-menu-offer" role="note">
            {includedMealOffer}
          </p>
        ) : null}
      </div>
    </header>
  );
}
