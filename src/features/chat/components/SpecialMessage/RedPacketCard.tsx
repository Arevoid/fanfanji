type RedPacketStatus = "unclaimed" | "claimed" | "expired" | "refunded";

interface RedPacketCardProps {
  amount: string;
  greeting: string;
  status: RedPacketStatus;
  isSelf: boolean;
  onClick: () => void;
}

const statusLabel: Record<RedPacketStatus, string> = {
  unclaimed: "待领取",
  claimed: "已领取",
  expired: "已退回",
  refunded: "已退回",
};

export function RedPacketCard({ amount, greeting, status, isSelf, onClick }: RedPacketCardProps) {
  const action = status === "unclaimed" ? (isSelf ? "等待对方拆开" : "点击拆红包") : statusLabel[status];
  return (
    <button type="button" onClick={onClick} className="special-payment-card redpacket-card cv-transfer" data-status={status} title="查看红包">
      <div className="special-payment-card__top"><span className="special-payment-card__title">红包</span><span className="special-payment-card__status">{action}</span></div>
      <div className="special-payment-card__money">¥{amount}</div>
      <div className="special-payment-card__note">{greeting}</div>
      <span className="special-payment-card__brand">Pay</span>
    </button>
  );
}
