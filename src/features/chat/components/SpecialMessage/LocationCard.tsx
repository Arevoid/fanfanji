import "./specialMessage.css";

interface LocationCardProps {
  location: string;
}

export function LocationCard({ location }: LocationCardProps) {
  const label = location.trim() || "未命名位置";

  return (
    <div className="special-payment-card location-card" role="group" aria-label={`位置 ${label}`}>
      <div className="location-card__address" title={label}>{label}</div>
      <div className="location-card__map" aria-hidden="true">
        <span className="location-card__pin" />
      </div>
    </div>
  );
}
