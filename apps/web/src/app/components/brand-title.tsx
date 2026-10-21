interface BrandTitleProps {
  title: string;
}

export const BrandTitle = ({ title }: BrandTitleProps) => (
  <div className="brand-title">
    <img
      className="brand-title-mascot"
      src="/assets/brand/CyberCatDetailedAvatar.png"
      width={60}
      height={60}
      alt=""
      aria-hidden="true"
    />
    <div className="brand-title-copy">
      <span className="brand-title-wordmark">Cyber<span>Cat</span></span>
      <h2 className="panel-title">{title}</h2>
    </div>
  </div>
);
