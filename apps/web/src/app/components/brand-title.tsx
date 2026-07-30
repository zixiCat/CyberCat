interface BrandTitleProps {
  title: string;
}

export const BrandTitle = ({ title }: BrandTitleProps) => (
  <div className="brand-title">
    <img
      className="brand-title-mascot"
      src="/assets/brand/CyberCat.png"
      alt=""
      aria-hidden="true"
    />
    <div className="brand-title-copy">
      <img
        className="brand-title-wordmark"
        src="/assets/brand/CyberCat4Text.png"
        alt="CyberCat"
      />
      <span className="panel-title">{title}</span>
    </div>
  </div>
);