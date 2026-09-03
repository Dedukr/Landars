import { FestivalVillageHorizon } from "./FestivalMenuDecoration";

export function FestivalMenuFooter() {
  return (
    <footer className="festival-menu-site-footer">
      <div className="festival-menu-site-footer-inner">
        <FestivalVillageHorizon />
        <p className="festival-menu-footer-note">
          Order at the festival counter — we&apos;ll prepare it fresh for you.
        </p>
      </div>
    </footer>
  );
}
